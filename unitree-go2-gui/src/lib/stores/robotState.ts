import { isDeepEqual } from 'remeda';
import { get } from 'svelte/store';
import { INITIAL_ROBOT_STATE } from '../data/robotState';
import type { Cue } from '../utils/commands';
import { confirmable, displayed } from '../utils/confirmable';
import { transition } from '../utils/transition';
import type { WebSocketClient } from '../utils/webSocketClient';

export const robotState = confirmable(INITIAL_ROBOT_STATE);

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
