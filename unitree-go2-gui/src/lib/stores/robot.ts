import { isDeepEqual, isEmpty, isIncludedIn, mapValues, pickBy, values } from 'remeda';
import { get, readonly, writable } from 'svelte/store';
import { SPEED_LEVELS } from '../data/settings';
import { enter, isCommandable, leave, transition } from '../utils/commands';
import type { CommandableGait, Cue, Posture, RobotState } from '../utils/commands';
import { displayed, propose, resolve, settle } from '../utils/confirmable';
import type { Confirmable } from '../utils/confirmable';
import { OUTCOMES, outcomeLog } from './outcomes.svelte';
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
    | { type: 'sport_state'; motionMode: string | null; mode: number | null; errorCode: number | null };

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

/// The outcome of request `_reqId`, named `_label`, recorded now.
const stamp = (_reqId: number, _label: string, _verdict: Verdict): Outcome => ({
    ..._verdict,
    reqId: _reqId,
    label: _label,
    at: Date.now(),
});

/// Creates the store of a relay not yet reached and of a robot in its boot state. `openSocket`
/// opens the control channel to the relay; a test passes one that returns a fake socket.
export const createRobot = ({
    openSocket,
    outcomeLog: log,
}: {
    openSocket: () => Pick<WebSocket, 'readyState' | 'send' | 'onopen' | 'onclose' | 'onmessage'>;
    outcomeLog: OutcomeLog;
}) => {
    /// The store's `set` and `update` stay inside this function, so no reader can show a value that
    /// neither the operator asked for nor the relay or the robot stated.
    const store = writable<{
        /// Whether the browser's control channel to the relay is open.
        channelOpen: boolean;
        /// Whether the relay reports a live WebRTC session with the robot.
        robotConnected: boolean;
        /// Whether the relay was last told to stream the lidar. The relay sends no verdict on it.
        lidarOn: boolean;
        /// Whether the relay was last told to subscribe to the robot's state stream. The relay sends
        /// no verdict on it.
        monitoringOn: boolean;
        /// The robot's settled values, and the changes that wait for the relay's verdict.
        state: Confirmable<RobotState>;
        /// The fields the robot has stated since the robot was last lost, each marked true.
        reported: Partial<Record<keyof RobotState, true>>;
        /// The last settled gait before the current one that the app can enter, so a toggle can
        /// return to it.
        previousGait: CommandableGait;
    }>({
        channelOpen: false,
        robotConnected: false,
        lidarOn: false,
        monitoringOn: false,
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
        /// A toggle that leaves a gait before any other gait was settled returns to the boot gait.
        previousGait: 'FreeWalk',
    });
    /// The latest decoded frame of the robot's camera, or null before the first one arrives.
    const frame = writable<ImageBitmap | null>(null);
    let socket: ReturnType<typeof openSocket> | undefined;
    /// The requests awaiting the relay's verdict, by request id.
    const awaiting = new Map<
        number,
        { resolve: (_outcome: Outcome) => void; timer: ReturnType<typeof setTimeout>; label: string }
    >();
    let lastRequestId = 0;
    /// Holds each unknown sport_state code already logged, so each is logged once.
    const warnedCodes = new Set<number>();

    /// Applies `_change` to the robot's state and marks the fields in `_reported`. A change of the
    /// settled gait records the gait it left as `previousGait`, if the app can enter that gait.
    const changeState = (
        _change: (_state: Confirmable<RobotState>) => Confirmable<RobotState>,
        _reported: Partial<Record<keyof RobotState, true>> = {},
    ) =>
        store.update((_robot) => {
            const state = _change(_robot.state);
            const left = _robot.state.settled.gait;
            return {
                ..._robot,
                state,
                reported: { ..._robot.reported, ..._reported },
                previousGait: state.settled.gait !== left && isCommandable(left) ? left : _robot.previousGait,
            };
        });

    /// Never throws: a closed channel is an answer the caller must handle.
    const send = (_msg: unknown) => {
        if (socket?.readyState !== OPEN) return false;
        try {
            socket.send(JSON.stringify(_msg));
            return true;
        } catch (error) {
            console.error('Failed to write to the control channel:', error);
            return false;
        }
    };

    /// Records the outcome of a request still awaited, settles or drops what the request proposed,
    /// and resolves its verdict.
    const finish = (_outcome: Outcome) => {
        const request = awaiting.get(_outcome.reqId);
        if (!request) return;
        clearTimeout(request.timer);
        awaiting.delete(_outcome.reqId);
        log.record(_outcome);
        changeState(resolve(_outcome.reqId, _outcome));
        request.resolve(_outcome);
    };

    /// Settles exactly the fields a report states and marks them reported; a report that states
    /// nothing changes nothing.
    const settleReport = (_report: Partial<RobotState>) => {
        if (!isEmpty(_report)) changeState(settle(_report), mapValues(_report, () => true as const));
    };

    const received = (_data: Blob | string) => {
        if (_data instanceof Blob) {
            createImageBitmap(_data)
                .then((_bitmap) =>
                    frame.update((_previous) => {
                        _previous?.close();
                        return _bitmap;
                    }),
                )
                .catch((_error) => console.error('Failed to decode video frame:', _error));
            return;
        }
        let msg: RelayMessage;
        try {
            msg = JSON.parse(_data);
        } catch {
            console.warn('Dropping a relay frame that is not JSON:', _data);
            return;
        }
        // JSON.parse reads "null" as null, which the default case drops.
        switch (msg?.type) {
            case 'robot_state':
                // Losing the robot clears `reported` and keeps the settled values.
                store.update((_robot) => ({
                    ..._robot,
                    robotConnected: msg.connected,
                    reported: msg.connected ? _robot.reported : {},
                }));
                return;
            case 'robot_settings': {
                const { speedLevel, obstacleAvoidance } = msg;
                const isLevel = isIncludedIn(speedLevel, values(SPEED_LEVELS));
                if (!isLevel) console.warn('Ignoring a speed level outside SPEED_LEVELS:', speedLevel);
                settleReport({
                    ...(isLevel ? { speed: speedLevel } : {}),
                    ...(typeof obstacleAvoidance === 'boolean' ? { obstacleAvoidance } : {}),
                });
                return;
            }
            case 'sport_state': {
                // REPORTED covers only "mcf", so a report outside "mcf" states nothing.
                if (msg.motionMode !== 'mcf' || msg.errorCode === null) return;
                const report = REPORTED[msg.errorCode];
                if (report !== undefined) settleReport(report);
                // An unknown code states nothing and is logged once, so each missing code can be collected.
                else if (!warnedCodes.has(msg.errorCode)) {
                    warnedCodes.add(msg.errorCode);
                    console.warn('Ignoring a sport_state code that REPORTED does not list:', msg.errorCode);
                }
                return;
            }
            case 'command_result': {
                if (msg.reqId === null) {
                    console.warn('Dropping a verdict on a command this browser did not send:', msg);
                    return;
                }
                // No awaiting request: the verdict arrived after the backstop.
                const request = awaiting.get(msg.reqId);
                const outcome = stamp(msg.reqId, request?.label ?? msg.command_name ?? 'command', {
                    // An outcome this browser does not know reads as `unknown`, never as a confirmation.
                    outcome: isIncludedIn(msg.outcome, OUTCOMES) ? msg.outcome : 'unknown',
                    code: msg.code,
                    detail: msg.detail ?? '',
                });
                if (request) finish(outcome);
                else log.record(outcome);
                return;
            }
            case 'state_stream':
                // The robot's telemetry. Nothing displays it yet.
                return;
            default:
                console.warn('Unrecognised relay message:', msg satisfies never);
        }
    };

    /// Tells the relay to switch `_command` on or off, and records in `_flag` what it was told once
    /// the message has left the browser.
    const switchRelay = (_command: string, _flag: 'lidarOn' | 'monitoringOn') => (_on: boolean) => {
        if (send({ command_name: _command, switch: _on })) store.update((_robot) => ({ ..._robot, [_flag]: _on }));
    };

    /// Sends a cue as one sequence of its steps, named by its label, and shows each field the cue
    /// changes as pending until the relay's verdict settles or drops it. Returns at once a promise
    /// of the verdict, which resolves once the store holds it.
    const request = (_cue: Cue): Promise<Outcome> => {
        const reqId = (lastRequestId += 1);
        const { label } = _cue;
        if (!send({ kind: 'sequence', command_name: label, sequence: _cue.steps, reqId })) {
            const outcome = stamp(reqId, label, CHANNEL_CLOSED);
            log.record(outcome);
            return Promise.resolve(outcome);
        }
        const shown = displayed(get(store).state);
        const changed = pickBy(transition(_cue)(shown), (_value, _field) => !isDeepEqual(_value, shown[_field]));
        // Proposed before the verdict can arrive, which is never earlier than the next relay message.
        if (!isEmpty(changed)) changeState(propose(changed, reqId));
        return new Promise<Outcome>((_resolve) => {
            const timer = setTimeout(() => finish(stamp(reqId, label, RELAY_SILENT)), REPLY_BACKSTOP_MS);
            awaiting.set(reqId, { resolve: _resolve, timer, label });
        });
    };

    return {
        subscribe: store.subscribe,
        videoFrame: readonly(frame),
        /// Opens the control channel, unless one is already open or opening.
        connect: () => {
            if ((socket?.readyState ?? CLOSED) < CLOSED) return;
            const opened = openSocket();
            opened.onopen = () => {
                store.update((_robot) => ({ ..._robot, channelOpen: true }));
                log.clear();
            };
            opened.onclose = () => {
                store.update((_robot) => ({ ..._robot, channelOpen: false, robotConnected: false, reported: {} }));
                get(frame)?.close();
                for (const [reqId, { label }] of [...awaiting]) finish(stamp(reqId, label, CHANNEL_CLOSED));
            };
            opened.onmessage = (_event) => received(_event.data);
            socket = opened;
        },
        /// Asks the relay to start a WebRTC session with the robot at `_ip`.
        connectRobot: (_ip: string) => void send({ command_name: 'connect', ip: _ip }),
        disconnectRobot: () => void send({ command_name: 'disconnect' }),
        request,
        /// The toggles ask for the opposite of what the robot shows, so a refused command leaves the
        /// next press asking for the same thing again. Each does nothing while a toggled field waits
        /// for a verdict: the cue would read the pending value and queue the opposite command.
        togglePosture: (_posture: Posture) => {
            const { pending, settled } = get(store).state;
            if (pending.posture !== undefined) return;
            void request(settled.posture === _posture ? leave(_posture) : enter(_posture));
        },
        /// From `_gait` in no posture, the toggle returns to `previousGait`.
        toggleGait: (_gait: CommandableGait) => {
            const { state, previousGait } = get(store);
            const { gait, posture } = state.settled;
            if (state.pending.gait !== undefined || state.pending.posture !== undefined) return;
            void request(enter(gait === _gait && posture === null ? previousGait : _gait));
        },
        setLidar: switchRelay('lidar', 'lidarOn'),
        setMonitoring: switchRelay('subscribe', 'monitoringOn'),
    };
};

/// The app's robot, which talks to the relay on this machine.
export const robot = createRobot({ openSocket: () => new WebSocket('ws://localhost:8000/ws'), outcomeLog });
