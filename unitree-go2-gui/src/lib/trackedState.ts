import { confirmable } from './confirmable';
import type { ConfirmableStore } from './confirmable';
import { CMD_switches_names, commandIndex } from './commandUtilities';
import type { CueItem, Payload } from './commandUtilities';
import type { Outcome } from './outcomes';
import type { WebSocketClient } from './webSocketClient';

/// The value each tracked robot state holds. `mode` is null when the last command switched a
/// mode off: the API does not say which mode the robot falls back to, so the interface shows
/// none rather than guessing.
type TrackedValues = {
    mode: string | null;
    headlight: string;
    speed: string;
    sitting: boolean;
    crouched: boolean;
    obstacleAvoidance: boolean;
};

/// The states a cue item implies, by state name. A state the item does not affect is absent.
export type ImpliedStates = Partial<TrackedValues>;

/// The locomotion mode the robot is believed to be in. The 14 mode commands are exclusive, so
/// one store backs the whole mode radio group.
export const mode = confirmable<TrackedValues['mode']>('FreeWalk');
export const headlight = confirmable<TrackedValues['headlight']>('white');
export const speed = confirmable<TrackedValues['speed']>('normal');
export const sitting = confirmable<TrackedValues['sitting']>(false);
export const crouched = confirmable<TrackedValues['crouched']>(false);
export const obstacleAvoidance = confirmable<TrackedValues['obstacleAvoidance']>(true);

/// The store behind each tracked state. The mapped type makes a state without a store a type
/// error, so `sendTracked` can move every state an item implies.
const STORES: { [K in keyof TrackedValues]: ConfirmableStore<TrackedValues[K]> } = {
    mode,
    headlight,
    speed,
    sitting,
    crouched,
    obstacleAvoidance,
};

/// The `data` value `SpeedLevel` sends for each speed the operator can pick.
export const speedValueMap: Record<string, number> = { slow: -1, normal: 0, fast: 1 };

/// The commands a cue item sends, in the order it sends them, nested sequences opened out.
const commandsOf = (item: CueItem): Payload[] => {
    switch (item.kind) {
        case 'command':
            return [item];
        case 'wait':
            return [];
        case 'sequence':
            return item.sequence.flatMap(commandsOf);
    }
};

/// The states one command implies on its own. A command missing the parameter its state
/// reads implies nothing, so a malformed payload never moves a control.
const statesOf = (command: Payload): ImpliedStates => {
    const name = command.command_name;
    const parameter = command.parameter ?? {};
    if (CMD_switches_names.includes(name)) {
        // The boolean sits under the command's own argument name: `data` for most switches,
        // `enabled` for Damp.
        const on: unknown = parameter[commandIndex[name].args[0].name];
        return typeof on === 'boolean' ? { mode: on ? name : null } : {};
    }
    switch (name) {
        case 'Headlight':
            return typeof parameter.color === 'string' ? { headlight: parameter.color } : {};
        case 'SpeedLevel': {
            // The level is read from `data`, the key the robot receives, although the command
            // table names the argument `level`.
            const level = Object.keys(speedValueMap).find(
                (key) => speedValueMap[key] === parameter.data,
            );
            return level === undefined ? {} : { speed: level };
        }
        case 'Sit':
            return { sitting: true };
        case 'RiseSit':
            return { sitting: false };
        case 'StandDown':
            return { crouched: true };
        case 'StandUp':
            return { crouched: false };
        case 'ObstaclesAvoid':
            return typeof parameter.enable === 'boolean'
                ? { obstacleAvoidance: parameter.enable }
                : {};
        default:
            return {};
    }
};

/// The state the robot should be in once a cue item has run. Each state takes the value of the
/// last command in the item that affects it, so `exitPose`, which switches Pose off and then
/// FreeWalk on, implies FreeWalk.
export const impliedStates = (item: CueItem): ImpliedStates =>
    commandsOf(item).reduce<ImpliedStates>(
        (states, command) => ({ ...states, ...statesOf(command) }),
        {},
    );

/// Tells one proposal from the next, so a verdict settles only the stores it was proposed on.
/// It never leaves the browser: WebSocketClient mints the ids the relay sees.
let lastProposal = 0;

/// Propose one state's value on its store, if the item implies that state. Answers whether it
/// proposed, so the caller resolves only the stores it moved. `mode` can imply null, so absence
/// is told by `undefined`, not by a falsy value.
const proposeState = <K extends keyof TrackedValues>(
    states: ImpliedStates,
    key: K,
    proposalId: number,
): boolean => {
    const value = states[key];
    if (value === undefined) return false;
    STORES[key].propose(value, proposalId);
    return true;
};

/// Send a cue item to the robot and move every control it affects. Each implied state is shown
/// at once as pending, and the one verdict the relay returns for the item settles or reverts
/// all of them. `overrides` is merged over the derived states, for a command whose effect the
/// derivation cannot read, such as Brightness standing for the white headlight.
export const sendTracked =
    (client: Pick<WebSocketClient, 'request'>) =>
    async (item: CueItem, overrides: ImpliedStates = {}): Promise<Outcome> => {
        const states: ImpliedStates = { ...impliedStates(item), ...overrides };
        const proposalId = (lastProposal += 1);
        const proposed = (Object.keys(STORES) as (keyof TrackedValues)[]).filter((key) =>
            proposeState(states, key, proposalId),
        );
        const verdict = await client.request(item);
        proposed.forEach((key) => STORES[key].resolve(proposalId, verdict));
        return verdict;
    };
