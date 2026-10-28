import { constant, evolve, filter, forEach, indexBy, isBoolean, isDeepEqual, isEmpty, isIncludedIn, isNonNullish } from 'remeda';
import { isPlainObject, join, keys, mapValues, merge, omit, omitBy, pickBy, pipe, piped, set, values } from 'remeda';
import { SPEED_LEVELS } from '../data/settings';
import { compiled, enter, face, isCommandable, postureChange, set as setting, transition } from '../utils/commands';
import type { CommandableGait, Cue, Posture, RobotState } from '../utils/commands';
import { displayed, propose, resolve, settle } from '../utils/confirmable';
import type { Confirmable } from '../utils/confirmable';
import { OUTCOMES, outcomeLog, summary } from './outcomes.svelte';
import type { Outcome, OutcomeLog } from './outcomes.svelte';

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
    | { type: 'sport_state'; motionMode: string | null; mode: number | null; errorCode: number | null }
    /// A snapshot (`errors`) or a delta (`add_error`, `rm_error`) of the robot's active faults.
    | { type: 'faults'; change: keyof typeof FAULT_CHANGES; faults: Fault[] };

/// One fault the robot reports: its source, its code, and the driver's text for both.
type Fault = { source: number; code: number; text: string };

/// Faults keyed by source and code, so the same fault reported twice is held once.
const keyed = indexBy((_fault: Fault) => `${_fault.source}-${_fault.code}`);
type Faults = ReturnType<typeof keyed>;

/// How each kind of fault message changes the active faults: a snapshot replaces them, a delta
/// adds or removes the faults it carries.
const FAULT_CHANGES = {
    errors: (_faults: Faults) => constant(_faults),
    add_error: (_faults: Faults) => (_active: Faults) => merge(_active, _faults),
    rm_error: (_faults: Faults) => (_active: Faults) => omitBy(_active, (_fault, _key) => _key in _faults),
};

// WebSocket.readyState values, named so the tests need no browser global.
const OPEN = 1;
const CLOSED = 3;

/// The relay bounds a single command at 5s, so this fires only once the relay has stopped answering.
const REPLY_BACKSTOP_MS = 20_000;

/// The part of an outcome that says what happened, without saying to which request or when.
type Verdict = Pick<Outcome, 'outcome' | 'code' | 'detail'>;

/// A command that never left the browser did not run: a failure, not a silence.
const CHANNEL_CLOSED: Verdict = {
    outcome: 'failed',
    code: null,
    detail: 'the control channel is closed, so the command never left the browser',
};

const RELAY_SILENT: Verdict = {
    outcome: 'unknown',
    code: null,
    detail: `the relay sent no verdict within ${REPLY_BACKSTOP_MS / 1000}s`,
};

/// The fields stated by each code the robot reports in `error_code` under the motion-control mode
/// "mcf". The table is transcribed from the official app by legion1581/unitree_ui; Unitree does not
/// document these values. A gait code also states that the robot is in no posture. ClassicWalk and
/// ContinuousGait have no known code.
const REPORTED: Partial<Record<number, Partial<RobotState>>> = {
    0: { gait: 'FreeWalk', posture: null },
    100: { gait: 'FreeWalk', posture: null },
    1015: { gait: 'StaticWalk', posture: null },
    1016: { gait: 'Running', posture: null },
    1017: { gait: 'EconomicGait', posture: null },
    2007: { gait: 'FreeAvoid', posture: null },
    2008: { gait: 'Bound', posture: null },
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

/// The outcome of request `_reqId`, named `_label`, recorded now.
const stamp = (_reqId: number, _label: string, _verdict: Verdict): Outcome =>
    merge(_verdict, { reqId: _reqId, label: _label, at: Date.now() });

/// The relay message `_data` holds, or null when `_data` is not JSON.
const parsed = (_data: string): RelayMessage | null => {
    try {
        return JSON.parse(_data);
    } catch {
        return null;
    }
};

/// Losing the robot clears `reported` and keeps the settled values.
/// The values a toggle switches between: the gaits the app can enter, and the colours.
type Toggled = { gait: CommandableGait; headlight: RobotState['headlight'] };

/// The cue each toggled field sends to reach a value.
const TOGGLES: { [F in keyof Toggled]: (_value: Toggled[F]) => Cue } = {
    gait: enter,
    headlight: (_colour) => setting({ name: 'headlight', value: _colour }),
};

/// `_previous` once the settled state moves from `_from` to `_to`: a toggled field that changed
/// keeps the value it left, if a toggle can send that value.
const previousAfter = (_previous: Toggled, _from: RobotState, _to: RobotState): Toggled => ({
    gait: _to.gait !== _from.gait && isCommandable(_from.gait) ? _from.gait : _previous.gait,
    headlight: _to.headlight !== _from.headlight ? _from.headlight : _previous.headlight,
});

/// Why a toggle changing `_fields` must wait, or null when none of them awaits a verdict: the cue
/// would read the pending value and queue the opposite command.
const waitingOn = (_pending: Confirmable<RobotState>['pending'], _fields: (keyof RobotState)[]) =>
    pipe(_fields, filter((_field) => _pending[_field] !== undefined), (_waiting) =>
        isEmpty(_waiting) ? null : `waiting for the verdict on the ${join(_waiting, ' and ')}`,
    );

/// Losing the robot also clears its faults: the next robot reports its own.
const lost = merge({ robotConnected: false, reported: {}, faults: {} });

/// The control channel to the relay, as far as the robot uses it.
type Socket = Pick<WebSocket, 'readyState' | 'send' | 'onopen' | 'onclose' | 'onmessage'>;

/// A relay not yet reached and a robot in its boot state. Only the class's own methods write its
/// state, so no reader can show a value that neither the operator asked for nor the relay or the
/// robot stated.
export class Robot {
    #current = $state.raw<{
        /// Whether the browser's control channel to the relay is open.
        channelOpen: boolean;
        /// Whether the relay reports a live WebRTC session with the robot.
        robotConnected: boolean;
        /// Whether the relay was last told to stream the lidar. The relay sends no verdict on it.
        lidarOn: boolean;
        /// The robot's settled values, and the changes that wait for the relay's verdict.
        state: Confirmable<RobotState>;
        /// The fields the robot has stated since the robot was last lost, each marked true.
        reported: Partial<Record<keyof RobotState, true>>;
        /// The last settled gait the app can enter and the last settled colour, each before the
        /// current one, so a toggle can return to it.
        previous: Toggled;
        /// The robot's active faults, as it last reported them.
        faults: Faults;
    }>({
        channelOpen: false,
        robotConnected: false,
        lidarOn: false,
        state: {
            settled: {
                /// The robot boots in FreeWalk, in no posture.
                gait: 'FreeWalk',
                posture: null,
                /// The robot boots green, keeps a colour until the next one is set, and never reports it.
                headlight: 'green',
                speed: 0,
                obstacleAvoidance: true,
            },
            pending: {},
        },
        reported: {},
        /// A toggle that leaves a value before any other was settled returns to the boot value.
        previous: { gait: 'FreeWalk', headlight: 'green' },
        faults: {},
    });
    get current() { return this.#current; }
    /// The latest decoded frame of the robot's camera, or null before the first one arrives.
    #frame = $state.raw<ImageBitmap | null>(null);
    get frame() { return this.#frame; }
    #openSocket: () => Socket;
    #log: OutcomeLog;
    #socket: Socket | undefined;
    /// The requests awaiting the relay's verdict, by request id.
    #awaiting = new Map<number, { resolve: (_outcome: Outcome) => void; timer: ReturnType<typeof setTimeout>; label: string }>();
    #lastRequestId = 0;
    /// Holds each unknown sport_state code already logged, so each is logged once.
    #warnedCodes = new Set<number>();

    /// `openSocket` opens the control channel to the relay; a test passes one that returns a fake socket.
    constructor({ openSocket, outcomeLog }: { openSocket: () => Socket; outcomeLog: OutcomeLog }) {
        this.#openSocket = openSocket;
        this.#log = outcomeLog;
    }

    #update = (_change: (_current: Robot['current']) => Robot['current']) => { this.#current = _change(this.#current); };

    /// Applies `_change` to the robot's state and marks the fields in `_reported`. A change of the
    /// settled gait or colour records the value it left in `previous`.
    #changeState = (
        _change: (_state: Confirmable<RobotState>) => Confirmable<RobotState>,
        _reported: Robot['current']['reported'] = {},
    ) =>
        this.#update((_robot) => {
            const state = _change(_robot.state);
            return merge(_robot, {
                state,
                reported: merge(_robot.reported, _reported),
                previous: previousAfter(_robot.previous, _robot.state.settled, state.settled),
            });
        });

    /// Never throws: a closed channel is an answer the caller must handle. A message that left the
    /// browser is logged under its command name, with its other fields as detail.
    #send = (_msg: { command_name: string } & Record<string, unknown>) => {
        if (this.#socket?.readyState !== OPEN) return false;
        try {
            this.#socket.send(JSON.stringify(_msg));
            this.#log.note('sent', _msg.command_name, JSON.stringify(omit(_msg, ['command_name'])));
            return true;
        } catch (error) {
            console.error('Failed to write to the control channel:', error);
            return false;
        }
    };

    /// Records `_verdict` as the outcome of request `_reqId` if it is still awaited, settles or drops
    /// what the request proposed, and resolves the request's promise. Returns the outcome, or
    /// undefined when no request awaits `_reqId`.
    #finish = (_verdict: Verdict) => (_reqId: number) => {
        const request = this.#awaiting.get(_reqId);
        if (!request) return undefined;
        clearTimeout(request.timer);
        this.#awaiting.delete(_reqId);
        const outcome = this.#log.record(stamp(_reqId, request.label, _verdict));
        this.#changeState(resolve(_reqId, outcome));
        request.resolve(outcome);
        return outcome;
    };

    /// Settles exactly the fields a report states and marks them reported; a report that states
    /// nothing changes nothing.
    #settleReport = (_report: Partial<RobotState>) => {
        if (!isEmpty(_report)) this.#changeState(settle(_report), mapValues(_report, constant(true as const)));
    };

    /// A new frame closes the one it replaces, which nothing draws any more. A closed channel shows
    /// null, so no reader is handed a closed bitmap.
    #show = (_bitmap: ImageBitmap | null) => {
        this.#frame?.close();
        this.#frame = _bitmap;
    };

    /// Logs every JSON frame, the robot's state stream apart from the other messages. Video frames
    /// are not logged: they are not messages, and they arrive 30 times per second.
    #received = (_data: Blob | string) => {
        if (_data instanceof Blob) {
            createImageBitmap(_data)
                .then(this.#show)
                .catch((_error) => console.error('Failed to decode video frame:', _error));
            return;
        }
        const msg = parsed(_data);
        // Applied first, so that a verdict's summary names the request it answers.
        const told = this.#apply(msg);
        // The log names each entry's kind, so a stream message shows only its data. Any other
        // message is summarised by its type, which its detail then leaves out.
        if (msg?.type === 'state_stream') this.#log.note('stream', '', JSON.stringify(msg.data));
        else if (isPlainObject(msg)) this.#log.note('received', told ?? msg.type, JSON.stringify(omit(msg, ['type'])));
        else this.#log.note('received', 'not a relay message', _data);
    };

    /// Applies a relay message. Returns the summary of a verdict, which names the request it answers;
    /// any other message is summarised by its type.
    #apply = (_msg: RelayMessage | null) => {
        // A frame that is not JSON, or a message of a type this browser does not know, reaches the default case.
        switch (_msg?.type) {
            case 'robot_state':
                this.#update(_msg.connected ? set('robotConnected', true) : lost);
                return;
            case 'robot_settings': {
                const { speedLevel, obstacleAvoidance } = _msg;
                const isLevel = isIncludedIn(speedLevel, values(SPEED_LEVELS));
                if (!isLevel) console.warn('Ignoring a speed level outside SPEED_LEVELS:', speedLevel);
                const speed = isLevel ? speedLevel : null;
                const avoids = isBoolean(obstacleAvoidance) ? obstacleAvoidance : null;
                this.#settleReport(pickBy({ speed, obstacleAvoidance: avoids }, isNonNullish));
                return;
            }
            case 'sport_state': {
                // REPORTED covers only "mcf", so a report outside "mcf" states nothing.
                if (_msg.motionMode !== 'mcf' || _msg.errorCode === null) return;
                const report = REPORTED[_msg.errorCode];
                if (report !== undefined) this.#settleReport(report);
                // An unknown code states nothing and is logged once, so each missing code can be collected.
                else if (!this.#warnedCodes.has(_msg.errorCode)) {
                    this.#warnedCodes.add(_msg.errorCode);
                    console.warn('Ignoring a sport_state code that REPORTED does not list:', _msg.errorCode);
                }
                return;
            }
            case 'command_result': {
                if (_msg.reqId === null) {
                    console.warn('Dropping a verdict on a command this browser did not send:', _msg);
                    return;
                }
                const verdict = {
                    // An outcome this browser does not know reads as `unknown`, never as a confirmation.
                    outcome: isIncludedIn(_msg.outcome, OUTCOMES) ? _msg.outcome : 'unknown',
                    code: _msg.code,
                    detail: _msg.detail ?? '',
                };
                // No awaiting request: the verdict arrived after the backstop, and the relay names it.
                const outcome =
                    this.#finish(verdict)(_msg.reqId) ??
                    this.#log.record(stamp(_msg.reqId, _msg.command_name ?? 'command', verdict));
                return summary(outcome);
            }
            case 'faults':
                // A change kind this browser does not know changes nothing.
                if (isIncludedIn(_msg.change, keys(FAULT_CHANGES)))
                    this.#update(evolve({ faults: FAULT_CHANGES[_msg.change](keyed(_msg.faults)) }));
                else console.warn('Ignoring a fault message of an unknown change:', _msg.change);
                return;
            case 'state_stream':
                // The robot's telemetry, which only the log shows.
                return;
            default:
                console.warn('Unrecognised relay message:', _msg satisfies null);
        }
    };

    /// Sends a cue as one sequence of its steps, named by its label, and shows each field the cue
    /// changes as pending until the relay's verdict settles or drops it. Returns at once a promise
    /// of the verdict, which resolves once the robot's state holds it.
    request = (_cue: Cue): Promise<Outcome> => {
        const reqId = (this.#lastRequestId += 1);
        const { label } = _cue;
        if (!this.#send({ kind: 'sequence', command_name: label, sequence: compiled(_cue).steps, reqId })) {
            this.block(label, CHANNEL_CLOSED.detail);
            return Promise.resolve(this.#log.record(stamp(reqId, label, CHANNEL_CLOSED)));
        }
        const shown = displayed(this.#current.state);
        const changed = pickBy(transition(_cue)(shown), (_value, _field) => !isDeepEqual(_value, shown[_field]));
        // Proposed before the verdict can arrive, which is never earlier than the next relay message.
        if (!isEmpty(changed)) this.#changeState(propose(changed, reqId));
        return new Promise<Outcome>((_resolve) => {
            const timer = setTimeout(() => this.#finish(RELAY_SILENT)(reqId), REPLY_BACKSTOP_MS);
            this.#awaiting.set(reqId, { resolve: _resolve, timer, label });
        });
    };

    /// Logs a press the app refused, named `_label`, with `_reason` in plain words. It is not a
    /// verdict, so the counts and the last outcome stay as they are.
    block = (_label: string, _reason: string) => this.#log.note('blocked', `${_label}: ${_reason}`, '');

    /// Opens the control channel, unless one is already open or opening.
    connect = () => {
        if ((this.#socket?.readyState ?? CLOSED) < CLOSED) return;
        const opened = this.#openSocket();
        opened.onopen = () => {
            this.#update(set('channelOpen', true));
            this.#log.clear();
        };
        opened.onclose = () => {
            this.#update(piped(lost, set('channelOpen', false)));
            this.#show(null);
            // The ids are copied first, because `#finish` deletes each one from the map.
            forEach([...this.#awaiting.keys()], this.#finish(CHANNEL_CLOSED));
        };
        opened.onmessage = (_event) => this.#received(_event.data);
        this.#socket = opened;
    };

    /// Asks the relay to start a WebRTC session with the robot at `_ip`.
    connectRobot = (_ip: string) => void this.#send({ command_name: 'connect', ip: _ip });
    disconnectRobot = () => void this.#send({ command_name: 'disconnect' });

    /// The toggles ask for the opposite of what the robot shows, so a refused command leaves the
    /// next press asking for the same thing again. Each logs the press as blocked while a toggled
    /// field waits for a verdict. A posture's toggle sends the side of its pair the settled state
    /// allows, so it does nothing while the robot is in another posture.
    togglePosture = (_posture: Posture) => {
        const { pending, settled } = this.#current.state;
        const waiting = waitingOn(pending, ['posture']);
        forEach(postureChange(_posture)(settled), (_cue) => (waiting === null ? void this.request(_cue) : this.block(face(_cue), waiting)));
    };

    /// Sends `_field` to `_value`, or back to its previous value when the robot already shows
    /// `_value`, that is, when the cue would change nothing. The fields the cue changes are the
    /// toggled ones: a gait's cue also leaves the posture.
    toggleTo = <F extends keyof Toggled>(_field: F, _value: Toggled[F]) => {
        const { state, previous } = this.#current;
        const cue = TOGGLES[_field](_value);
        const waiting = waitingOn(state.pending, keys(compiled(cue).change));
        if (waiting !== null) return this.block(_value, waiting);
        void this.request(isDeepEqual(transition(cue)(state.settled), state.settled) ? TOGGLES[_field](previous[_field]) : cue);
    };

    /// Tells the relay to stream the lidar or to stop, and records what it was told once the
    /// message has left the browser.
    setLidar = (_on: boolean) => {
        if (this.#send({ command_name: 'lidar', switch: _on })) this.#update(set('lidarOn', _on));
    };
}

/// The app's robot, which talks to the relay on this machine.
export const robot = new Robot({ openSocket: () => new WebSocket('ws://localhost:8000/ws'), outcomeLog });
