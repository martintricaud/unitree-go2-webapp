import { isEmpty, isIncludedIn, keys, values } from 'remeda';
import { ACTIONS, MCF_CODES, MODES } from '../data/sportCommands';
import { BRIGHTNESS, EULER, SETTINGS, SPEED_LEVELS } from '../data/settings';
import { cueLabel } from './commands';
import type { Cue, RobotState } from './commands';
import { OUTCOMES, clearOutcomes, recordOutcome } from '../stores/outcomes';
import type { Outcome } from '../stores/outcomes';
import { robotConnected, robotReport, videoFrame, webSocketConnected } from '../stores/connection';

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

export function encode(_cue: Cue): Wire {
    switch (_cue.kind) {
        case 'enter':
        case 'leave':
            return {
                kind: 'command',
                topic: 'SPORT_MOD',
                api_id: MODES[_cue.mode].api_id,
                command_name: _cue.mode,
                parameter: { [MODES[_cue.mode].argument]: _cue.kind === 'enter' },
            };
        case 'perform':
            return {
                kind: 'command',
                topic: 'SPORT_MOD',
                api_id: ACTIONS[_cue.action].api_id,
                command_name: _cue.action,
            };
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
            return { kind: 'sequence', displayName: _cue.label, sequence: _cue.items.map(encode) };
    }
}

const RELAY_URL = 'ws://localhost:8000/ws';

// WebSocket.readyState values, named so the tests need no browser global.
const OPEN = 1;
const CLOSED = 3;

/// The relay bounds a single command at 5s, so this fires only once the relay has stopped answering.
const REPLY_BACKSTOP_MS = 20_000;

/// A command that never left the browser did not run: a failure, not a silence.
function CHANNEL_CLOSED(_reqId: number, _label: string): Outcome {
    return {
        outcome: 'failed',
        code: null,
        detail: 'the control channel is closed, so the command never left the browser',
        reqId: _reqId,
        label: _label,
        at: Date.now(),
    };
}

function RELAY_SILENT(_reqId: number, _label: string): Outcome {
    return {
        outcome: 'unknown',
        code: null,
        detail: `the relay sent no verdict within ${REPLY_BACKSTOP_MS / 1000}s`,
        reqId: _reqId,
        label: _label,
        at: Date.now(),
    };
}

/// Widened to every number, so any reported code can be looked up; an absent code reads as undefined.
const FIELDS_BY_CODE: Partial<Record<number, Partial<Pick<RobotState, 'gait' | 'posture'>>>> = MCF_CODES;

/// The unknown codes already logged, so each is logged once.
const warnedCodes = new Set<number>();

/// The fields a report states. A report outside "mcf", whose codes the table does not cover, states
/// nothing. An unknown code states nothing and is logged once, so the missing codes can be collected.
function decodeSportState(_motionMode: string | null, _errorCode: number | null) {
    if (_motionMode !== 'mcf' || _errorCode === null) return {};
    const fields = FIELDS_BY_CODE[_errorCode];
    if (fields === undefined && !warnedCodes.has(_errorCode)) {
        warnedCodes.add(_errorCode);
        console.warn('Ignoring a sport_state code missing from MCF_CODES:', _errorCode);
    }
    return fields ?? {};
}

/// Publishes the fields a frame states as one new report; a frame that states none publishes nothing.
function publish(_report: Partial<RobotState>) {
    if (!isEmpty(_report)) robotReport.set(_report);
}

/// The part of a WebSocket this client writes to, so a test can supply a recorder.
export type Sink = { readyState: number; send(data: string): void };

/// Null for a frame that is not JSON. An outcome this browser does not know reads as
/// `unknown`, never as a confirmation.
function parseRelayMessage(_raw: string) {
    try {
        const msg = JSON.parse(_raw);
        const outcome = isIncludedIn(msg.outcome, keys(OUTCOMES)) ? msg.outcome : 'unknown';
        return (msg.type === 'command_result' ? { ...msg, outcome } : msg) as RelayMessage;
    } catch {
        return null;
    }
}

export class WebSocketClient {
    private socket: Sink | null = null;
    private previousBitmap: ImageBitmap | null = null;
    private pending = new Map<
        number,
        { resolve: (outcome: Outcome) => void; timer: ReturnType<typeof setTimeout>; label: string }
    >();
    private lastRequestId = 0;

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
        webSocketConnected.set(true);
        clearOutcomes();
    }

    closed() {
        webSocketConnected.set(false);
        robotConnected.set(false);
        this.previousBitmap?.close();
        this.previousBitmap = null;
        for (const [reqId, { label }] of [...this.pending]) {
            this.settle(CHANNEL_CLOSED(reqId, label));
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
                robotConnected.set(msg.connected);
                return;
            case 'robot_settings': {
                const { speedLevel, obstacleAvoidance } = msg;
                const isLevel = isIncludedIn(speedLevel, values(SPEED_LEVELS));
                if (!isLevel) console.warn('Ignoring a speed level outside SPEED_LEVELS:', speedLevel);
                publish({
                    ...(isLevel ? { speed: speedLevel } : {}),
                    ...(typeof obstacleAvoidance === 'boolean' ? { obstacleAvoidance } : {}),
                });
                return;
            }
            case 'sport_state': {
                publish(decodeSportState(msg.motionMode, msg.errorCode));
                return;
            }
            case 'command_result': {
                if (msg.reqId === null) {
                    console.warn('Dropping a verdict on a command this browser did not send:', msg);
                    return;
                }
                // No pending request: the verdict arrived after the backstop.
                const pending = this.pending.get(msg.reqId);
                const outcome = {
                    outcome: msg.outcome,
                    code: msg.code,
                    detail: msg.detail ?? '',
                    reqId: msg.reqId,
                    label: pending?.label ?? msg.command_name ?? 'command',
                    at: Date.now(),
                };
                if (pending) this.settle(outcome);
                else recordOutcome(outcome);
                return;
            }
            case 'state_stream':
                // The robot's telemetry. Nothing displays it yet.
                return;
            default:
                console.warn('Unrecognised relay message:', msg satisfies never);
        }
    }

    /// Send a cue and wait for the relay's verdict on it.
    request(cue: Cue): Promise<Outcome> {
        const reqId = (this.lastRequestId += 1);
        const label = cueLabel(cue);
        if (!this.send({ ...encode(cue), reqId })) {
            const outcome = CHANNEL_CLOSED(reqId, label);
            recordOutcome(outcome);
            return Promise.resolve(outcome);
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => this.settle(RELAY_SILENT(reqId, label)), REPLY_BACKSTOP_MS);
            this.pending.set(reqId, { resolve, timer, label });
        });
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

    private settle(outcome: Outcome) {
        const pending = this.pending.get(outcome.reqId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(outcome.reqId);
        recordOutcome(outcome);
        pending.resolve(outcome);
    }

    private async showFrame(blob: Blob) {
        try {
            const bitmap = await createImageBitmap(blob);
            this.previousBitmap?.close();
            this.previousBitmap = bitmap;
            videoFrame.set(bitmap);
        } catch (error) {
            console.error('Failed to decode video frame:', error);
        }
    }
}

export const websocket = new WebSocketClient();
