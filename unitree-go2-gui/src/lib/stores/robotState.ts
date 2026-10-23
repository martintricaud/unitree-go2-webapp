import { isDeepEqual, isEmpty, isNonNull, mapValues, pickBy } from 'remeda';
import { derived, get } from 'svelte/store';
import { transition } from '../utils/commands';
import type { Cue, RobotState } from '../utils/commands';
import { confirmable, displayed } from '../utils/confirmable';
import { robotMode, robotSettings } from './connection';
import type { WebSocketClient } from '../utils/webSocketClient';

export const robotState = confirmable<RobotState>({
    mode: 'FreeWalk',
    posture: 'standing',
    /// The robot boots green, keeps a colour until the next one is set, and never reports it.
    headlight: 'green',
    speed: 0,
    obstacleAvoidance: true,
});

/// The robot's report settles the fields it carries; a field it has not reported keeps its value.
robotSettings.subscribe((_settings) => robotState.observe(pickBy(_settings, isNonNull)));

/// A report that names no mode leaves the settled mode as it was.
robotMode.subscribe((_mode) => {
    if (_mode !== null) robotState.observe({ mode: _mode });
});

/// Whether the robot has reported each field it states since the robot or the control channel
/// was last lost.
export const reported = derived(robotSettings, (_settings) => mapValues(_settings, isNonNull));

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
