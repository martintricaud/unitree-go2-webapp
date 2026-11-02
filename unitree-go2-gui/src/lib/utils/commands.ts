import { filter, flatMap, hasAtLeast, identity, isDeepEqual, isPlainObject, keys, map, mergeAll, objOf, pipe, prop, sortBy, take, values } from 'remeda';
import * as v from 'valibot';
import { SPORT_API } from '../data/sportApi';
import { BRIGHTNESS, COLOURS, EULER, SETTINGS, SPEED_LEVELS } from '../data/settings';
import { distinct, leaves } from './trees';
import type { Tree } from './trees';

type SportRequest = keyof typeof SPORT_API;

type FlagRequest = {
    [R in SportRequest]: (typeof SPORT_API)[R] extends { flag: true } ? R : never;
}[SportRequest];

/// One request a posture's entry or exit sends: a request without argument, or a flag request
/// with the flag it sends.
export type PostureRequest = Exclude<SportRequest, FlagRequest> | readonly [FlagRequest, boolean];

type PostureRequests = readonly [PostureRequest, ...PostureRequest[]];

/// The ways the robot walks. In a gait the robot can walk, and standing still is part of the gait.
/// `enter` is the request that enters the gait; a gait without one is reported by the robot but
/// not commandable.
export const GAITS = {
    FreeWalk: { enter: 'FreeWalk' },
    StaticWalk: { enter: 'StaticWalk' },
    Running: { enter: 'TrotRun' },
    EconomicGait: { enter: 'EconomicGait' },
    ClassicWalk: { enter: 'ClassicWalk' },
    ContinuousGait: { enter: 'ContinuousGait' },
    Bound: { enter: 'FreeBound' },
    Jumping: { enter: 'FreeJump' },
    FreeAvoid: { enter: 'FreeAvoid' },
    Handstand: { enter: 'HandStand' },
    Backstand: { enter: 'WalkUpright' },
    CrossStep: { enter: 'CrossStep' },
    Stairs: {},
    LeadFollow: {},
    Rage: {},
} as const satisfies Record<string, { enter?: SportRequest }>;

/// The states in which the robot cannot walk. `enter` brings the robot into the posture from its
/// gait, `exit` brings it back into the gait it had. Pose needs the robot to stop first.
export const POSTURES = {
    Pose: { enter: ['StopMove', ['Pose', true]], exit: [['Pose', false]] },
    Sitting: { enter: ['Sit'], exit: ['RiseSit'] },
    Lying: { enter: ['StandDown'], exit: ['StandUp', 'BalanceStand'] },
    JointLock: { enter: ['StandUp'], exit: ['BalanceStand'] },
    Damp: { enter: ['Damp'], exit: ['RecoveryStand'] },
} as const satisfies Record<string, { enter: PostureRequests; exit: PostureRequests }>;

/// The one-shot movements. Each changes neither the gait nor the posture.
export const ACTIONS = [
    'StopMove',
    'Hello',
    'Stretch',
    'Content',
    'Dance1',
    'Dance2',
    'Scrape',
    'FrontJump',
    'FrontPounce',
    'Heart',
    'FrontFlip',
    'LeftFlip',
    'RightFlip',
    'BackFlip',
] as const satisfies readonly SportRequest[];

type Gait = keyof typeof GAITS;
export type Posture = keyof typeof POSTURES;

export type CommandableGait = {
    [G in Gait]: (typeof GAITS)[G] extends { enter: SportRequest } ? G : never;
}[Gait];

/// True for a gait the app can command.
export const isCommandable = (_gait: Gait): _gait is CommandableGait => 'enter' in GAITS[_gait];

/// The gaits the app can command, in the order of `GAITS`.
export const COMMANDABLE_GAITS = pipe(GAITS, keys(), filter(isCommandable));

/// The two sides of each posture's toggle: the left one enters the posture, the right one leaves it.
export const POSTURE_FACES = {
    Sitting: ['Sit', 'Rise'],
    Lying: ['Lie', 'Stand'],
    Damp: ['Damp', 'Recover'],
    Pose: ['Enter Pose', 'Exit Pose'],
    JointLock: ['Lock', 'Unlock'],
} as const satisfies Record<Posture, readonly [string, string]>;

/// True for a target that is a posture; the other targets are gaits.
const isPosture = (_target: CommandableGait | Posture): _target is Posture => _target in POSTURES;

export type RobotState = {
    /// While the robot is in a posture, this keeps the gait it returns to on leaving the posture.
    gait: Gait;
    /// Null when the robot is in its gait.
    posture: Posture | null;
    headlight: (typeof COLOURS)[number];
    speed: (typeof SPEED_LEVELS)[keyof typeof SPEED_LEVELS];
    obstacleAvoidance: boolean;
};

const finite = v.pipe(v.number(), v.finite());
const amount = v.pipe(finite, v.minValue(0));

/// A stored leaf calling command `_name`, whose arguments `_args` validates.
const stored = <N extends string, A extends v.GenericSchema>(_name: N, _args: A) =>
    v.strictObject({ id: v.number(), label: v.string(), name: v.literal(_name), args: _args });

/// A stored leaf: an identifier, a label, and a call of one command with its arguments. The
/// commands' parameters are derived from this schema, so that a stored call and the command it
/// calls cannot drift apart.
const leafSchema = v.variant('name', [
    stored('enter', v.strictTuple([v.picklist([...COMMANDABLE_GAITS, ...keys(POSTURES)])])),
    stored('leave', v.strictTuple([v.picklist(keys(POSTURES))])),
    stored('perform', v.strictTuple([v.picklist(ACTIONS)])),
    stored('recover', v.strictTuple([], 'recover takes no argument')),
    stored(
        'set',
        v.strictTuple([
            v.variant('name', [
                v.strictObject({ name: v.literal('headlight'), value: v.picklist(COLOURS) }),
                v.strictObject({ name: v.literal('speed'), value: v.picklist(values(SPEED_LEVELS)) }),
                v.strictObject({ name: v.literal('obstacleAvoidance'), value: v.boolean() }),
            ]),
        ]),
    ),
    stored('orient', v.strictTuple([finite, finite, finite])),
    stored('dim', v.strictTuple([amount])),
    stored('wait', v.strictTuple([amount])),
]);

/// Each command's arguments, by command name.
type Params = { [L in v.InferOutput<typeof leafSchema> as L['name']]: L['args'] };

/// One call of a command, as data: its name and its arguments.
type Call = { [K in keyof Params]: { name: K; args: Params[K] } }[keyof Params];

/// A cue the operator fires: a call of one command, or a sequence of one or more cues that runs
/// them in order. Every cue has a label, which names it in the cue sheet and the outcome log.
export type Cue = Tree<{ label: string }, Call>;

/// A cue of the sheet: every node also holds an identifier, which keys link to. A cell is its own
/// stored form.
export type Cell = Tree<{ label: string; id: number }, Call>;

/// One message the relay sends to the robot, or a pause between two of them.
type Step =
    | { kind: 'command'; topic: string; api_id: number; command_name: string; parameter?: Record<string, unknown> }
    | { kind: 'wait'; wait: number };

/// What a cue does: the messages it sends, in order, and the fields of `RobotState` it sets.
type Act = { label: string; steps: Step[]; change: Partial<RobotState> };

/// The message that sends `_parameter`, if any, to `_endpoint`.
const message = (
    { topic, api_id, command_name }: { topic: string; api_id: number; command_name: string },
    _parameter?: Record<string, unknown>,
): Step => ({ kind: 'command', topic, api_id, command_name, parameter: _parameter });

/// One sport request. A flag request carries `_flag`; a request without flag takes no argument.
const sport = (_request: SportRequest | PostureRequest) =>
    pipe(typeof _request === 'string' ? ([_request, true] as const) : _request, ([_name, _flag]) =>
        message(
            { topic: 'SPORT_MOD', api_id: SPORT_API[_name].api_id, command_name: _name },
            'flag' in SPORT_API[_name] ? { data: _flag } : undefined,
        ),
    );

/// The change that sets field `name` of `RobotState` to `value`.
const field = <K extends keyof RobotState>({ name, value }: { name: K; value: RobotState[K] }): Partial<RobotState> => objOf(value, name);

/// What each command does, labelled as a new cue of it is labelled. A posture's entry and exit are
/// labelled with the faces of the pane buttons that send them. Entering a posture keeps the gait;
/// entering a gait leaves any posture. RecoveryStand stands the robot in its gait from any state.
const COMMANDS: { [K in keyof Params]: (..._args: Params[K]) => Act } = {
    enter: (_target) =>
        isPosture(_target)
            ? { label: POSTURE_FACES[_target][0], steps: map(POSTURES[_target].enter, sport), change: { posture: _target } }
            : { label: _target, steps: [sport(GAITS[_target].enter)], change: { gait: _target, posture: null } },
    leave: (_posture) => ({ label: POSTURE_FACES[_posture][1], steps: map(POSTURES[_posture].exit, sport), change: { posture: null } }),
    perform: (_action) => ({ label: _action, steps: [sport(_action)], change: {} }),
    recover: () => ({ label: 'RecoveryStand', steps: [sport('RecoveryStand')], change: { posture: null } }),
    set: (_setting) =>
        pipe(SETTINGS[_setting.name], (_endpoint) => ({
            label: _endpoint.command_name,
            steps: [message(_endpoint, { [_endpoint.argument]: _setting.value })],
            change: field(_setting),
        })),
    orient: (_x, _y, _z) => ({ label: EULER.command_name, steps: [message(EULER, { x: _x, y: _y, z: _z })], change: {} }),
    dim: (_level) => ({
        label: BRIGHTNESS.command_name,
        steps: [message(BRIGHTNESS, { [BRIGHTNESS.argument]: _level })],
        change: {},
    }),
    wait: (_seconds) => ({ label: `⏱ ${_seconds}s`, steps: [{ kind: 'wait', wait: _seconds }], change: {} }),
};

/// What `_call` does, as its command defines it.
const run = <K extends keyof Params>({ name, args }: { name: K; args: Params[K] }) => COMMANDS[name](...args);

/// A cue calling command `_name` with `_args`, under the label its command gives it. Each
/// constructor below fixes its arity, so that a caller such as `map` cannot pass extra arguments.
/// Each returns `Cue`, so that a list of cues of different commands has one element type.
const call = <K extends keyof Params>(_name: K, ..._args: Params[K]) => ({ label: COMMANDS[_name](..._args).label, name: _name, args: _args });

export const enter = (_target: Params['enter'][0]): Cue => call('enter', _target);
export const leave = (_posture: Posture): Cue => call('leave', _posture);
export const perform = (_action: Params['perform'][0]): Cue => call('perform', _action);
export const recover = (): Cue => call('recover');
export const set = (_setting: Params['set'][0]): Cue => call('set', _setting);
export const orient = (_x: number, _y: number, _z: number): Cue => call('orient', _x, _y, _z);
export const dim = (_level: number): Cue => call('dim', _level);
export const wait = (_seconds: number): Cue => call('wait', _seconds);

/// Runs `_items` one after the other, as one cue. An empty label leaves the sequence unnamed.
export const sequence = (_label: string, ..._items: [Cue, ...Cue[]]): Cue => ({
    label: _label === '' ? 'unnamed sequence' : _label,
    items: _items,
});

/// What `_cue` does: the messages of its calls, in order, and the fields they set, the last call
/// that sets a field deciding its value.
export const compiled = (_cue: Cue) =>
    pipe(leaves([_cue]), map(run), (_acts) => ({ steps: flatMap(_acts, prop('steps')), change: mergeAll(map(_acts, prop('change'))) }));

/// The steps of `_cue` that send a message to the robot, in order, without its waits.
export const commandsOf = (_cue: Cue) => filter(compiled(_cue).steps, (_step) => _step.kind === 'command');

/// The state the robot is in once `_cue` has run from `_state`.
export const transition = (_cue: Cue) => (_state: RobotState): RobotState => ({ ..._state, ...compiled(_cue).change });

/// True for Damp, the one posture the robot can enter and leave (by RecoveryStand) from any
/// state, reported or not, so that the operator can always drop the robot or stand it up.
export const anyState = (_posture: Posture) => _posture === 'Damp';

/// The cue that leaves `_posture` from `_state`, then re-enters the gait `_state` records, after
/// 0.1 s, unless the app cannot command that gait. The robot is not documented to resume its gait
/// by itself.
export const leaveToGait = (_posture: Posture) => ({ gait }: RobotState) =>
    isCommandable(gait) ? sequence(leave(_posture).label, leave(_posture), wait(0.1), enter(gait)) : leave(_posture);

/// The sides of `_posture`'s pair the robot can take from `_state`. In no posture the robot can
/// enter any posture; in a posture it can only leave that posture. Damp's pair allows both sides.
export const postureSides = (_posture: Posture) => (_state: RobotState) =>
    anyState(_posture)
        ? [enter(_posture), leaveToGait(_posture)(_state)]
        : _state.posture === null
          ? [enter(_posture)]
          : _state.posture === _posture
            ? [leaveToGait(_posture)(_state)]
            : [];

/// The side of `_sides` a key sends from `_state`, as zero or one cue: the first side that changes
/// the state, or the first side when none does.
export const toggled = (_state: RobotState) => (_sides: Cue[]) =>
    pipe(_sides, sortBy((_side) => isDeepEqual(transition(_side)(_state), _state)), take(1));

/// A non-empty list of stored cells. The check runs first, so that `_message` alone reports an
/// empty list. Lazy, because groups and cells refer to each other.
const cellsOf = (_message: string) =>
    v.pipe(v.array(v.unknown()), v.check(hasAtLeast(1), _message), v.tupleWithRest([v.lazy(() => cellSchema)], v.lazy(() => cellSchema)));

/// A stored cell is a group when it has `items`, and a leaf otherwise, so that each reports its
/// own issues.
export const cellSchema: v.GenericSchema<unknown, Cell> = v.lazy((_input) =>
    isPlainObject(_input) && 'items' in _input
        ? v.strictObject({ id: v.number(), label: v.string(), items: cellsOf('a group needs at least one cell') })
        : leafSchema,
);

/// Fails when two of the cells `_cellsOf` finds in the input, nested ones included, share an
/// identifier.
export const distinctIn = <T>(_cellsOf: (_input: T) => Cell[]) =>
    v.check((_input: T) => distinct(_cellsOf(_input)), 'two cells share an identifier');

/// A stored sheet: a non-empty list of cells, each identifier held by one cell only.
export const sheetSchema = v.pipe(cellsOf('a sheet needs at least one cell'), distinctIn(identity()));
