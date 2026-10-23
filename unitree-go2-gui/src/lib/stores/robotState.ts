import { isDeepEqual, isNonNull, mapValues, pickBy } from 'remeda';
import { derived, get } from 'svelte/store';
import { transition } from '../utils/commands';
import type { Cue, RobotState } from '../utils/commands';
import { confirmable, displayed } from '../utils/confirmable';
import { robotSettings } from './connection';
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

/// Whether the robot has reported each field it states since the robot or the control channel
/// was last lost.
export const reported = derived(robotSettings, (_settings) => mapValues(_settings, isNonNull));

/// Browser-side only: WebSocketClient mints the ids the relay sees.
let lastProposal = 0;

/// Shows the state the cue leads to as pending until the relay's verdict settles or reverts it.
/// The client is taken by the one method used, so a test can stand in for the relay.
export function send(_client: Pick<WebSocketClient, 'request'>) {
    return async function (_cue: Cue) {
        const shown = displayed(get(robotState));
        const next = transition(_cue)(shown);
        const proposalId = (lastProposal += 1);
        if (!isDeepEqual(next, shown)) robotState.propose(next, proposalId);
        const verdict = await _client.request(_cue);
        robotState.resolve(proposalId, verdict);
        return verdict;
    };
}
