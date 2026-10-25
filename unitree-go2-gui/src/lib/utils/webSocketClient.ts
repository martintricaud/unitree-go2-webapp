import { isEmpty, isIncludedIn, values } from 'remeda';
import { SPEED_LEVELS } from '../data/settings';
import type { Cue, RobotState } from './commands';
import { OUTCOMES, outcomeLog, recorded } from '../stores/outcomes';
import type { Outcome } from '../stores/outcomes';
import {
    lidarOn,
    monitoringOn,
    robotConnected,
    robotReport,
    videoFrame,
    webSocketConnected,
} from '../stores/connection';
import type * as connection from '../stores/connection';

/// Every JSON message the relay sends. Video frames arrive separately, as binary.
type RelayMessage =
    | { type: 'robot_state'; connected: boolean }
    | (Pick<Outcome, 'outcome' | 'code'> & {
          type: 'command_result';
          detail: string | null;
          reqId: number | null;
          command_name: string | null;
      })
    | { type: 'state_stream'; data: unknown }
    /// Null for a field the robot's report did not carry.
    | {
          type: 'robot_settings';
          speedLevel: number | null;
          obstacleAvoidance: RobotState['obstacleAvoidance'] | null;
      }
    /// The robot's `rt/lf/sportmodestate` report, sent only when one of its fields changes. Null for
    /// a field the report did not carry, or for a motion-control mode the relay could not read.
    | { type: 'sport_state'; motionMode: string | null; mode: number | null; errorCode: number | null };

const RELAY_URL = 'ws://localhost:8000/ws';

// WebSocket.readyState values, named so the tests need no browser global.
const OPEN = 1;
const CLOSED = 3;

/// The relay bounds a single command at 5s, so this fires only once the relay has stopped answering.
const REPLY_BACKSTOP_MS = 20_000;

/// A command that never left the browser did not run: a failure, not a silence.
function CHANNEL_CLOSED(_reqId: number, _label: string, _at: number): Outcome {
    return {
        outcome: 'failed',
        code: null,
        detail: 'the control channel is closed, so the command never left the browser',
        reqId: _reqId,
        label: _label,
        at: _at,
    };
}

function RELAY_SILENT(_reqId: number, _label: string, _at: number): Outcome {
    return {
        outcome: 'unknown',
        code: null,
        detail: `the relay sent no verdict within ${REPLY_BACKSTOP_MS / 1000}s`,
        reqId: _reqId,
        label: _label,
        at: _at,
    };
}

/// The fields stated by each code the robot reports in `error_code` under the motion-control mode
/// "mcf". The table is transcribed from the official app by legion1581/unitree_ui; Unitree does not
/// document these values. A gait code also states that the robot is in no posture. ClassicWalk and
/// ContinuousGait have no known code.
const REPORTED: Partial<Record<number, Partial<RobotState>>> = {
    0: { gait: 'FreeWalk', posture: null },
    100: { gait: 'FreeWalk', posture: null },
    1015: { gait: 'StaticWalk', posture: null },
    1016: { gait: 'Trotting', posture: null },
    1017: { gait: 'EconomicGait', posture: null },
    2007: { gait: 'FreeAvoid', posture: null },
    2008: { gait: 'Leaping', posture: null },
    2009: { gait: 'Jumping', posture: null },
    2010: { gait: 'Stairs', posture: null },
    2011: { gait: 'Handstand', posture: null },
    2016: { gait: 'CrossStep', posture: null },
    2017: { gait: 'Backstand', posture: null },
    2019: { gait: 'LeadFollow', posture: null },
    2021: { gait: 'Rage', posture: null },
    1001: { posture: 'Damp' },
    1002: { posture: 'JointLock' },
    1004: { posture: 'Lying' },
    1007: { posture: 'Sitting' },
    1091: { posture: 'Pose' },
    /// balanceStand: the robot stands still in its gait, so it is in no posture and keeps its gait.
    /// Unitree's ROS 2 documentation separates balanceStand (standing) from locomotion (moving).
    1013: { posture: null },
    /// "move" and "hello", which are transient and state nothing.
    1005: {},
    1006: {},
};

/// The fields a report states, or the code when the table does not cover it. A report outside
/// "mcf" states nothing, because the table covers only "mcf".
function decodeSportState(_motionMode: string | null, _errorCode: number | null) {
    if (_motionMode !== 'mcf' || _errorCode === null) return { report: {} };
    const fields = REPORTED[_errorCode];
    return fields === undefined ? { unknownCode: _errorCode } : { report: fields };
}

/// The part of a WebSocket this client writes to, so a test can supply a recorder.
export type Sink = { readyState: number; send(data: string): void };

/// Null for a frame that is not JSON. An outcome this browser does not know reads as
/// `unknown`, never as a confirmation.
function parseRelayMessage(_raw: string) {
    try {
        const msg = JSON.parse(_raw);
        const outcome = isIncludedIn(msg.outcome, OUTCOMES) ? msg.outcome : 'unknown';
        return (msg.type === 'command_result' ? { ...msg, outcome } : msg) as RelayMessage;
    } catch {
        return null;
    }
}

/// The stores a client writes. The app passes its own; a test passes fresh ones.
type ClientStores = Pick<
    typeof connection,
    'webSocketConnected' | 'robotConnected' | 'videoFrame' | 'robotReport' | 'lidarOn' | 'monitoringOn'
> & { outcomeLog: typeof outcomeLog };

export class WebSocketClient {
    private socket: Sink | null = null;
    private previousBitmap: ImageBitmap | null = null;
    /// The requests awaiting the relay's verdict, by request id.
    private awaiting = new Map<
        number,
        { resolve: (outcome: Outcome) => void; timer: ReturnType<typeof setTimeout>; label: string }
    >();
    private lastRequestId = 0;
    /// Holds each unknown sport_state code already logged, so each is logged once.
    private warnedCodes = new Set<number>();

    private readonly stores: ClientStores;

    constructor(_stores: ClientStores) {
        this.stores = _stores;
    }

    connect() {
        if (this.socket && this.socket.readyState < CLOSED) return;
        const ws = new WebSocket(RELAY_URL);
        ws.onopen = () => this.opened();
        ws.onclose = () => this.closed();
        ws.onmessage = (event) => {
            void this.received(event.data);
        };
        this.attach(ws);
    }

    attach(socket: Sink) {
        this.socket = socket;
    }

    opened() {
        this.stores.webSocketConnected.set(true);
        this.stores.outcomeLog.set([]);
    }

    closed() {
        this.stores.webSocketConnected.set(false);
        this.stores.robotConnected.set(false);
        this.previousBitmap?.close();
        this.previousBitmap = null;
        for (const [reqId, { label }] of [...this.awaiting]) {
            this.settle(CHANNEL_CLOSED(reqId, label, Date.now()));
        }
    }

    async received(data: Blob | string) {
        if (data instanceof Blob) {
            await this.showFrame(data);
            return;
        }
        const msg = parseRelayMessage(data);
        if (msg === null) {
            console.warn('Dropping a relay frame that is not JSON:', data);
            return;
        }
        switch (msg.type) {
            case 'robot_state':
                this.stores.robotConnected.set(msg.connected);
                return;
            case 'robot_settings': {
                const { speedLevel, obstacleAvoidance } = msg;
                const isLevel = isIncludedIn(speedLevel, values(SPEED_LEVELS));
                if (!isLevel) console.warn('Ignoring a speed level outside SPEED_LEVELS:', speedLevel);
                this.publish({
                    ...(isLevel ? { speed: speedLevel } : {}),
                    ...(typeof obstacleAvoidance === 'boolean' ? { obstacleAvoidance } : {}),
                });
                return;
            }
            case 'sport_state': {
                const decoded = decodeSportState(msg.motionMode, msg.errorCode);
                if (decoded.unknownCode !== undefined) this.warnUnknownCode(decoded.unknownCode);
                else this.publish(decoded.report);
                return;
            }
            case 'command_result': {
                if (msg.reqId === null) {
                    console.warn('Dropping a verdict on a command this browser did not send:', msg);
                    return;
                }
                // No awaiting request: the verdict arrived after the backstop.
                const request = this.awaiting.get(msg.reqId);
                const outcome = {
                    outcome: msg.outcome,
                    code: msg.code,
                    detail: msg.detail ?? '',
                    reqId: msg.reqId,
                    label: request?.label ?? msg.command_name ?? 'command',
                    at: Date.now(),
                };
                if (request) this.settle(outcome);
                else this.stores.outcomeLog.update(recorded(outcome));
                return;
            }
            case 'state_stream':
                // The robot's telemetry. Nothing displays it yet.
                return;
            default:
                console.warn('Unrecognised relay message:', msg satisfies never);
        }
    }

    /// Send a cue as one sequence of its steps, named by its label. Returns at once with the id the relay sees and a promise of the relay's verdict,
    /// so the caller can attach its own bookkeeping to the same id.
    request(cue: Cue): { reqId: number; verdict: Promise<Outcome> } {
        const reqId = (this.lastRequestId += 1);
        const { label } = cue;
        if (!this.send({ kind: 'sequence', command_name: label, sequence: cue.steps, reqId })) {
            const outcome = CHANNEL_CLOSED(reqId, label, Date.now());
            this.stores.outcomeLog.update(recorded(outcome));
            return { reqId, verdict: Promise.resolve(outcome) };
        }
        const verdict = new Promise<Outcome>((resolve) => {
            const timer = setTimeout(() => this.settle(RELAY_SILENT(reqId, label, Date.now())), REPLY_BACKSTOP_MS);
            this.awaiting.set(reqId, { resolve, timer, label });
        });
        return { reqId, verdict };
    }

    /// Never throws: a closed channel is an answer the caller must handle.
    send(msg: unknown): boolean {
        if (!this.socket || this.socket.readyState !== OPEN) return false;
        try {
            this.socket.send(JSON.stringify(msg));
            return true;
        } catch (error) {
            console.error('Failed to write to the control channel:', error);
            return false;
        }
    }

    /// Tells the relay to start or stop streaming the lidar, and records what it was told once the
    /// message has left the browser.
    setLidar(_next: boolean) {
        if (this.send({ command_name: 'lidar', switch: _next })) this.stores.lidarOn.set(_next);
    }

    /// Tells the relay to subscribe to or leave the robot's state stream, and records what it was
    /// told once the message has left the browser.
    setMonitoring(_next: boolean) {
        if (this.send({ command_name: 'subscribe', switch: _next })) this.stores.monitoringOn.set(_next);
    }

    private settle(outcome: Outcome) {
        const request = this.awaiting.get(outcome.reqId);
        if (!request) return;
        clearTimeout(request.timer);
        this.awaiting.delete(outcome.reqId);
        this.stores.outcomeLog.update(recorded(outcome));
        request.resolve(outcome);
    }

    /// Publishes the fields a frame states as one new report; a frame that states none publishes nothing.
    private publish(_report: Partial<RobotState>) {
        if (!isEmpty(_report)) this.stores.robotReport.set(_report);
    }

    /// An unknown code states nothing and is logged once, so each missing code can be collected.
    private warnUnknownCode(_code: number) {
        if (this.warnedCodes.has(_code)) return;
        this.warnedCodes.add(_code);
        console.warn('Ignoring a sport_state code that REPORTED does not list:', _code);
    }

    private async showFrame(blob: Blob) {
        try {
            const bitmap = await createImageBitmap(blob);
            this.previousBitmap?.close();
            this.previousBitmap = bitmap;
            this.stores.videoFrame.set(bitmap);
        } catch (error) {
            console.error('Failed to decode video frame:', error);
        }
    }
}

export const websocket = new WebSocketClient({
    webSocketConnected,
    robotConnected,
    videoFrame,
    robotReport,
    lidarOn,
    monitoringOn,
    outcomeLog,
});
