import { entries, isEmpty, isIncludedIn, values } from 'remeda';
import { SPORT_API } from '../data/sportApi';
import { BRIGHTNESS, EULER, SETTINGS, SPEED_LEVELS } from '../data/settings';
import { BALANCE_STAND_CODE, GAITS, POSTURES, TRANSIENT_CODES, cueLabel, isPosture } from './commands';
import type { Cue, RobotState, SportRequest, Step } from './commands';
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

/// A cue as the relay reads it.
type Wire =
    | {
          kind: 'command';
          topic: string;
          api_id: number;
          command_name: string;
          parameter?: Record<string, unknown>;
      }
    | { kind: 'wait'; wait: number }
    | { kind: 'sequence'; displayName?: string; sequence: Wire[] };

/// One sport request. A flag request carries `_flag`; a request without flag takes no argument.
const sportCommand = (_request: SportRequest, _flag = true): Wire => ({
    kind: 'command',
    topic: 'SPORT_MOD',
    api_id: SPORT_API[_request].api_id,
    command_name: _request,
    ...('flag' in SPORT_API[_request] ? { parameter: { data: _flag } } : {}),
});

const stepCommand = (_step: Step) =>
    typeof _step === 'string' ? sportCommand(_step) : sportCommand(_step[0], _step[1]);

/// The wire cues a cue sends in a row. A posture's entry or exit sends each of its steps; any other
/// cue is one wire cue. A sequence splices its items' rows, so the steps of a posture inside a named
/// sequence run under that name.
function row(_cue: Cue): Wire[] {
    switch (_cue.kind) {
        case 'enter':
            return isPosture(_cue.target)
                ? POSTURES[_cue.target].enter.map(stepCommand)
                : [sportCommand(GAITS[_cue.target].enter)];
        case 'leave':
            return POSTURES[_cue.posture].exit.map(stepCommand);
        default:
            return [encode(_cue)];
    }
}

export function encode(_cue: Cue): Wire {
    switch (_cue.kind) {
        case 'enter':
        case 'leave': {
            const [first, ...rest] = row(_cue);
            return rest.length === 0 ? first : { kind: 'sequence', displayName: cueLabel(_cue), sequence: [first, ...rest] };
        }
        case 'perform':
            return sportCommand(_cue.action);
        case 'recover':
            return sportCommand('RecoveryStand');
        case 'set': {
            const { topic, api_id, command_name, argument } = SETTINGS[_cue.setting.name];
            return {
                kind: 'command',
                topic,
                api_id,
                command_name,
                parameter: { [argument]: _cue.setting.value },
            };
        }
        case 'orient':
            return {
                kind: 'command',
                topic: EULER.topic,
                api_id: EULER.api_id,
                command_name: EULER.command_name,
                parameter: { x: _cue.x, y: _cue.y, z: _cue.z },
            };
        case 'dim':
            return {
                kind: 'command',
                topic: BRIGHTNESS.topic,
                api_id: BRIGHTNESS.api_id,
                command_name: BRIGHTNESS.command_name,
                parameter: { [BRIGHTNESS.argument]: _cue.brightness },
            };
        case 'wait':
            return { kind: 'wait', wait: _cue.seconds };
        case 'sequence':
            return { kind: 'sequence', displayName: _cue.label, sequence: _cue.items.flatMap(row) };
    }
}

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

type Fields = Partial<Pick<RobotState, 'gait' | 'posture'>>;

/// The fields each "mcf" code states. A gait code also states that the robot is in no posture.
const FIELDS_BY_CODE = new Map<number, Fields>([
    ...entries(GAITS).flatMap(([_gait, { codes }]) =>
        codes.map((_code): [number, Fields] => [_code, { gait: _gait, posture: null }]),
    ),
    ...entries(POSTURES).flatMap(([_posture, { codes }]) =>
        codes.map((_code): [number, Fields] => [_code, { posture: _posture }]),
    ),
    [BALANCE_STAND_CODE, { posture: null }],
    ...TRANSIENT_CODES.map((_code): [number, Fields] => [_code, {}]),
]);

/// The fields a report states, or the code when the table does not cover it. A report outside
/// "mcf", whose codes the table does not cover, states nothing.
function decodeSportState(_motionMode: string | null, _errorCode: number | null) {
    if (_motionMode !== 'mcf' || _errorCode === null) return { report: {} };
    const fields = FIELDS_BY_CODE.get(_errorCode);
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
    /// The unknown sport_state codes already logged, so each is logged once.
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

    /// Send a cue. Returns at once with the id the relay sees and a promise of the relay's verdict,
    /// so the caller can attach its own bookkeeping to the same id.
    request(cue: Cue): { reqId: number; verdict: Promise<Outcome> } {
        const reqId = (this.lastRequestId += 1);
        const label = cueLabel(cue);
        if (!this.send({ ...encode(cue), reqId })) {
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

    /// An unknown code states nothing and is logged once, so the missing codes can be collected.
    private warnUnknownCode(_code: number) {
        if (this.warnedCodes.has(_code)) return;
        this.warnedCodes.add(_code);
        console.warn('Ignoring a sport_state code that no gait or posture lists:', _code);
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
