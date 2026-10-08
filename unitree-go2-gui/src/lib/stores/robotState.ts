import { keys } from 'remeda';
import type { SwitchName } from '../data/commands';
import type { Colour, Speed } from '../data/options';
import { confirmable } from '../utils/confirmable';
import type { ConfirmableStore, ConfirmedValue } from '../utils/confirmable';
import { impliedStates } from '../utils/impliedStates';
import type { CueItem } from '../utils/payloads';
import type { WebSocketClient } from '../utils/webSocketClient';

/// The store behind each robot state the interface tracks. `mode` is the locomotion mode: the 14
/// mode commands are exclusive, so one store backs the whole mode radio group. `mode` is null
/// when the last command switched a mode off: the API does not say which mode the robot falls
/// back to, so the interface shows none rather than guessing.
const STORES = {
    mode: confirmable<SwitchName | null>('FreeWalk'),
    headlight: confirmable<Colour>('white'),
    speed: confirmable<Speed>('normal'),
    sitting: confirmable(false),
    crouched: confirmable(false),
    obstacleAvoidance: confirmable(true),
};

export const { mode, headlight, speed, sitting, crouched, obstacleAvoidance } = STORES;

/// The value each tracked robot state holds, read off its store.
export type RobotState = { [K in keyof typeof STORES]: ConfirmedValue<(typeof STORES)[K]> };

/// The same stores, viewed through a mapped type so that the store read at any key `K` is known
/// to accept a `RobotState[K]`. TypeScript does not draw that link from the object literal alone.
const STORE_OF: { [K in keyof RobotState]: ConfirmableStore<RobotState[K]> } = STORES;

/// Tells one proposal from the next, so a verdict settles only the stores it was proposed on.
/// It never leaves the browser: WebSocketClient mints the ids the relay sees.
let lastProposal = 0;

/// Propose one state's value on its store, if the item implies that state. Answers whether it
/// proposed, so the caller resolves only the stores it moved. `mode` can imply null, so absence
/// is told by `undefined`, not by a falsy value.
function proposeState<K extends keyof RobotState>(
    _states: Partial<RobotState>,
    _key: K,
    _proposalId: number,
) {
    const value = _states[_key];
    if (value === undefined) return false;
    STORE_OF[_key].propose(value, _proposalId);
    return true;
}

/// Send a cue item to the robot and move every control it affects. Each implied state is shown
/// at once as pending, and the one verdict the relay returns for the item settles or reverts
/// all of them. `overrides` is merged over the derived states, for a command whose effect the
/// derivation cannot read, such as Brightness standing for the white headlight. The client is
/// taken by the one method used, so a test can stand in for the relay.
export function send(_client: Pick<WebSocketClient, 'request'>) {
    return async function (_item: CueItem, _overrides: Partial<RobotState> = {}) {
        const states = { ...impliedStates(_item), ..._overrides };
        const proposalId = (lastProposal += 1);
        const proposed = keys(STORE_OF).filter(function (_key) {
            return proposeState(states, _key, proposalId);
        });
        const verdict = await _client.request(_item);
        proposed.forEach(function (_key) {
            STORE_OF[_key].resolve(proposalId, verdict);
        });
        return verdict;
    };
}
