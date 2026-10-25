import { isEmpty, mapValues } from 'remeda';
import { writable } from 'svelte/store';
import type { RobotState } from '../utils/commands';
import { observe, propose, resolve } from '../utils/confirmable';
import type { Confirmable } from '../utils/confirmable';
import type { Outcome } from './outcomes';

/// What the browser knows of the relay and the robot. Only the WebSocket client writes it.
export type Mirror = {
    /// Whether the browser's control channel to the relay is open.
    channelOpen: boolean;
    /// Whether the relay reports a live WebRTC session with the robot.
    robotConnected: boolean;
    /// Whether the relay was last told to stream the lidar. The relay sends no verdict on it.
    lidarOn: boolean;
    /// Whether the relay was last told to subscribe to the robot's state stream. The relay sends no
    /// verdict on it.
    monitoringOn: boolean;
    /// The robot's settled values, and the changes that wait for the relay's verdict.
    robot: Confirmable<RobotState>;
    /// The fields the robot has stated since the robot was last lost, each marked true.
    reported: Partial<Record<keyof RobotState, true>>;
};

/// Creates a mirror of a relay not yet reached and of a robot in its boot state.
export const createMirror = () => {
    /// The store's `set` and `update` stay inside this function, so no reader can show a value that
    /// neither the operator asked for nor the relay or the robot stated.
    const state = writable<Mirror>({
        channelOpen: false,
        robotConnected: false,
        lidarOn: false,
        monitoringOn: false,
        robot: {
            settled: {
                /// The robot boots in FreeWalk, in no posture.
                gait: 'FreeWalk',
                posture: null,
                /// A toggle that leaves a gait before any other gait was known returns to the boot gait.
                previousGait: 'FreeWalk',
                /// The robot boots green, keeps a colour until the next one is set, and never reports it.
                headlight: 'green',
                speed: 0,
                obstacleAvoidance: true,
            },
            pending: {},
        },
        reported: {},
    });

    const changeRobot = (_change: (_robot: Confirmable<RobotState>) => Confirmable<RobotState>) =>
        state.update((_mirror) => ({ ..._mirror, robot: _change(_mirror.robot) }));

    return {
        subscribe: state.subscribe,
        setChannelOpen: (_open: boolean) => state.update((_mirror) => ({ ..._mirror, channelOpen: _open })),
        /// Losing the robot clears `reported` and keeps the settled values.
        setRobotConnected: (_connected: boolean) =>
            state.update((_mirror) => ({
                ..._mirror,
                robotConnected: _connected,
                reported: _connected ? _mirror.reported : {},
            })),
        setLidarOn: (_on: boolean) => state.update((_mirror) => ({ ..._mirror, lidarOn: _on })),
        setMonitoringOn: (_on: boolean) => state.update((_mirror) => ({ ..._mirror, monitoringOn: _on })),
        /// Settles exactly the fields a report states and marks them reported; a report that states
        /// nothing changes nothing. A report that changes a known settled gait also settles the old
        /// gait as `previousGait`, as a confirmed command would.
        observe: (_report: Partial<RobotState>) => {
            if (isEmpty(_report)) return;
            state.update((_mirror) => {
                const { gait } = _mirror.robot.settled;
                const changesGait = _report.gait !== undefined && gait !== null && _report.gait !== gait;
                return {
                    ..._mirror,
                    robot: observe(changesGait ? { ..._report, previousGait: gait } : _report)(_mirror.robot),
                    reported: { ..._mirror.reported, ...mapValues(_report, () => true as const) },
                };
            });
        },
        /// Shows `_fields` as pending until the verdict on request `_reqId` settles or drops them.
        propose: (_fields: Partial<RobotState>, _reqId: number) => changeRobot(propose(_fields, _reqId)),
        resolve: (_reqId: number, _outcome: Outcome) => changeRobot(resolve(_reqId, _outcome)),
    };
};

/// The app's mirror, which the app's WebSocket client writes.
export const mirror = createMirror();
