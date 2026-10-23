import { isDeepEqual, isEmpty, mapValues, pickBy } from 'remeda';
import { get, readonly, writable } from 'svelte/store';
import { transition } from '../utils/commands';
import type { Cue, RobotState } from '../utils/commands';
import { confirmable, displayed } from '../utils/confirmable';
import { robotConnected, robotReport } from './connection';
import type { WebSocketClient } from '../utils/webSocketClient';

export const robotState = confirmable<RobotState>({
    mode: 'FreeWalk',
    posture: 'standing',
    /// The robot boots green, keeps a colour until the next one is set, and never reports it.
    headlight: 'green',
    speed: 0,
    obstacleAvoidance: true,
});

const stated = writable<Partial<Record<keyof RobotState, true>>>({});

/// The fields the robot has stated since the robot was last lost, each marked true.
export const reported = readonly(stated);

/// Each report settles exactly the fields it states and marks them reported.
robotReport.subscribe((_report) => {
    robotState.observe(_report);
    stated.update((_marked) => ({ ..._marked, ...mapValues(_report, () => true as const) }));
});

robotConnected.subscribe((_connected) => {
    if (!_connected) stated.set({});
});

/// Browser-side only: WebSocketClient mints the ids the relay sees.
let lastProposal = 0;

/// Shows each field the cue changes as pending until the relay's verdict settles or drops it.
/// The client is taken by the one method used, so a test can stand in for the relay.
export function send(_client: Pick<WebSocketClient, 'request'>) {
    return async function (_cue: Cue) {
        const shown = displayed(get(robotState));
        const changed = pickBy(transition(_cue)(shown), (_value, _field) => !isDeepEqual(_value, shown[_field]));
        const proposalId = (lastProposal += 1);
        if (!isEmpty(changed)) robotState.propose(changed, proposalId);
        const verdict = await _client.request(_cue);
        robotState.resolve(proposalId, verdict);
        return verdict;
    };
}
