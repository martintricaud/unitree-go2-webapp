import { isDeepEqual, isEmpty, mapValues, pickBy } from 'remeda';
import { get, readonly, writable } from 'svelte/store';
import { transition } from '../utils/commands';
import type { Cue, RobotState } from '../utils/commands';
import { displayed, observe, propose, resolve } from '../utils/confirmable';
import type { Confirmable } from '../utils/confirmable';
import { websocket } from '../utils/webSocketClient';
import type { WebSocketClient } from '../utils/webSocketClient';
import { robotConnected, robotReport } from './connection';
import type * as connection from './connection';

/// What a robot state is built from. The client is taken by the one method used, so a test can
/// stand in for the relay; the stores are the ones the client writes.
type RobotStateSources = { client: Pick<WebSocketClient, 'request'> } & Pick<
    typeof connection,
    'robotReport' | 'robotConnected'
>;

/// Creates the robot state, which follows the robot's reports and the verdicts on the cues it sends.
export const createRobotState = (_sources: RobotStateSources) => {
    /// The store's `set` and `update` stay inside this function, so no caller can show a value that
    /// neither the operator asked for nor the robot stated.
    const state = writable<Confirmable<RobotState>>({
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
    });

    const stated = writable<Partial<Record<keyof RobotState, true>>>({});

    /// Each report settles exactly the fields it states and marks them reported. A report that changes
    /// a known settled gait also settles the old gait as `previousGait`, as a confirmed command would.
    _sources.robotReport.subscribe((_report) => {
        const { gait } = get(state).settled;
        const changesGait = _report.gait !== undefined && gait !== null && _report.gait !== gait;
        state.update(observe(changesGait ? { ..._report, previousGait: gait } : _report));
        stated.update((_marked) => ({ ..._marked, ...mapValues(_report, () => true as const) }));
    });

    _sources.robotConnected.subscribe((_connected) => {
        if (!_connected) stated.set({});
    });

    return {
        subscribe: state.subscribe,
        /// The fields the robot has stated since the robot was last lost, each marked true.
        reported: readonly(stated),
        /// Shows each field the cue changes as pending until the relay's verdict settles or drops it.
        /// The proposal carries the request id the relay sees, so the verdict on that request resolves it.
        send: async (_cue: Cue) => {
            const shown = displayed(get(state));
            const changed = pickBy(transition(_cue)(shown), (_value, _field) => !isDeepEqual(_value, shown[_field]));
            const { reqId, verdict } = _sources.client.request(_cue);
            // Proposed before the first await, so no verdict can be handled before the proposal exists.
            if (!isEmpty(changed)) state.update(propose(changed, reqId));
            const outcome = await verdict;
            state.update(resolve(reqId, outcome));
            return outcome;
        },
    };
};

/// The app's robot state, following the app's client and connection stores.
export const robotState = createRobotState({ client: websocket, robotReport, robotConnected });
