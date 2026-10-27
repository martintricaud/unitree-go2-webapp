import { filter, first, flatMap, forEach, hasAtLeast, isEmpty, isPlainObject, keys, map, merge, reduce } from 'remeda';
import { identity, pick, pipe, prop, take, unique, values } from 'remeda';
import * as v from 'valibot';
import { SPORT_API } from '../data/sportApi';
import { BRIGHTNESS, COLOURS, EULER, SETTINGS, SPEED_LEVELS } from '../data/settings';

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
    Trotting: { enter: 'TrotRun' },
    EconomicGait: { enter: 'EconomicGait' },
    ClassicWalk: { enter: 'ClassicWalk' },
    ContinuousGait: { enter: 'ContinuousGait' },
    Leaping: { enter: 'FreeBound' },
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
    'FrontFlip',
    'FrontJump',
    'FrontPounce',
    'Heart',
    'LeftFlip',
    'RightFlip',
    'BackFlip',
] as const satisfies readonly SportRequest[];

type Gait = keyof typeof GAITS;
export type Posture = keyof typeof POSTURES;
type Action = (typeof ACTIONS)[number];

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

type SettingName = keyof typeof SETTINGS;

type Setting = { [K in SettingName]: { name: K; value: RobotState[K] } }[SettingName];

/// One field of `RobotState` set to a defined value.
type Change = { [K in keyof RobotState]: Pick<RobotState, K> }[keyof RobotState];

/// The change each setting makes. A table keyed by setting, so that a setting's field and value
/// stay correlated without a cast.
const SETTING_CHANGES: { [K in SettingName]: (_value: RobotState[K]) => Change } = {
    headlight: (_headlight) => ({ headlight: _headlight }),
    speed: (_speed) => ({ speed: _speed }),
    obstacleAvoidance: (_on) => ({ obstacleAvoidance: _on }),
};

const settingChange = <K extends SettingName>(_setting: { name: K; value: RobotState[K] }) =>
    SETTING_CHANGES[_setting.name](_setting.value);

/// One message the relay sends to the robot, or a pause between two of them.
type Step =
    | { kind: 'command'; topic: string; api_id: number; command_name: string; parameter?: Record<string, unknown> }
    | { kind: 'wait'; wait: number };

/// What the operator fires. `label` names it in the cue sheet and the outcome log; `steps` are the
/// messages it sends, in order; `changes` are the fields it changes in `RobotState`, in order;
/// `items` holds the cues a sequence was built from, and is empty for any other cue; `source` holds
/// the constructor calls it runs, in order, so that it can be stored as data.
export type Cue = { label: string; steps: Step[]; changes: Change[]; items: Cue[]; source: Command[] };

/// One sport request. A flag request carries `_flag`; a request without flag takes no argument.
const sportCommand = (_request: SportRequest, _flag = true): Step =>
    merge(
        { kind: 'command', topic: 'SPORT_MOD', api_id: SPORT_API[_request].api_id, command_name: _request },
        'flag' in SPORT_API[_request] ? { parameter: { data: _flag } } : {},
    );

const stepCommand = (_request: PostureRequest) =>
    typeof _request === 'string' ? sportCommand(_request) : sportCommand(_request[0], _request[1]);

/// Entering a posture keeps the gait; entering a gait leaves any posture.
export const enter = (_target: CommandableGait | Posture): Cue =>
    merge(
        isPosture(_target)
            ? { steps: pipe(POSTURES[_target].enter, map(stepCommand)), changes: [{ posture: _target }] }
            : { steps: [sportCommand(GAITS[_target].enter)], changes: [{ gait: _target }, { posture: null }] },
        { label: _target, items: [], source: [{ name: 'enter', args: [_target] } satisfies Command] },
    );

export const leave = (_posture: Posture): Cue => ({
    label: `Exit ${_posture}`,
    steps: pipe(POSTURES[_posture].exit, map(stepCommand)),
    changes: [{ posture: null }],
    items: [],
    source: [{ name: 'leave', args: [_posture] }],
});

export const perform = (_action: Action): Cue => ({
    label: _action,
    steps: [sportCommand(_action)],
    changes: [],
    items: [],
    source: [{ name: 'perform', args: [_action] }],
});

/// RecoveryStand: from any state, the robot stands in its gait, in no posture.
export const recover = (): Cue => ({
    label: 'RecoveryStand',
    steps: [sportCommand('RecoveryStand')],
    changes: [{ posture: null }],
    items: [],
    source: [{ name: 'recover', args: [] }],
});

export const set = (_setting: Setting): Cue => {
    const { topic, api_id, command_name, argument } = SETTINGS[_setting.name];
    return {
        label: command_name,
        steps: [{ kind: 'command', topic, api_id, command_name, parameter: { [argument]: _setting.value } }],
        changes: [settingChange(_setting)],
        items: [],
        source: [{ name: 'set', args: [_setting] }],
    };
};

/// Changes nothing the interface tracks.
export const orient = (_x: number, _y: number, _z: number): Cue => ({
    label: EULER.command_name,
    steps: [
        {
            kind: 'command',
            topic: EULER.topic,
            api_id: EULER.api_id,
            command_name: EULER.command_name,
            parameter: { x: _x, y: _y, z: _z },
        },
    ],
    changes: [],
    items: [],
    source: [{ name: 'orient', args: [_x, _y, _z] }],
});

/// Changes nothing the interface tracks.
export const dim = (_brightness: number): Cue => ({
    label: BRIGHTNESS.command_name,
    steps: [
        {
            kind: 'command',
            topic: BRIGHTNESS.topic,
            api_id: BRIGHTNESS.api_id,
            command_name: BRIGHTNESS.command_name,
            parameter: { [BRIGHTNESS.argument]: _brightness },
        },
    ],
    changes: [],
    items: [],
    source: [{ name: 'dim', args: [_brightness] }],
});

export const wait = (_seconds: number): Cue => ({
    label: `⏱ ${_seconds}s`,
    steps: [{ kind: 'wait', wait: _seconds }],
    changes: [],
    items: [],
    source: [{ name: 'wait', args: [_seconds] }],
});

/// Runs its items one after the other, as one cue. An empty label leaves the sequence unnamed.
export const sequence = (_label: string, ..._items: [Cue, ...Cue[]]): Cue => ({
    label: _label === '' ? 'unnamed sequence' : _label,
    steps: pipe(_items, flatMap(prop('steps'))),
    changes: pipe(_items, flatMap(prop('changes'))),
    items: _items,
    source: pipe(_items, flatMap(prop('source'))),
});

export type RobotState = {
    /// While the robot is in a posture, this keeps the gait it returns to on leaving the posture.
    gait: Gait;
    /// Null when the robot is in its gait.
    posture: Posture | null;
    headlight: (typeof COLOURS)[number];
    speed: (typeof SPEED_LEVELS)[keyof typeof SPEED_LEVELS];
    obstacleAvoidance: boolean;
};

/// The state the robot is in once the cue has run from `_state`: its changes merged in order.
/// A fold of `merge`, because `mergeAll` over a list types every field as optional.
export const transition = (_cue: Cue) => (_state: RobotState) =>
    pipe(_cue.changes, reduce((_merged: RobotState, _change: Change) => merge(_merged, _change), _state));

const RAW = { enter, leave, perform, recover, set, orient, dim, wait };

/// Each command's arguments, as its constructor takes them.
type Params = { [K in keyof typeof RAW]: Parameters<(typeof RAW)[K]> };

/// The constructors, typed so that a command's name and arguments stay correlated: `COMMANDS[name](...args)`
/// type-checks for any `name` and the `args` of that name.
const COMMANDS: { [K in keyof Params]: (..._args: Params[K]) => Cue } = RAW;

/// One constructor call as data: the form a command takes in storage and in a file.
type Command = { [K in keyof Params]: { name: K; args: Params[K] } }[keyof Params];

const finite = v.pipe(v.number(), v.finite());
const amount = v.pipe(finite, v.minValue(0));

/// Each command's arguments. The annotation ties each schema to its constructor's parameters, so a
/// schema that drifts from its constructor fails the type check.
const ARGS: { [K in keyof Params]: v.GenericSchema<unknown, Params[K]> } = {
    enter: v.strictTuple([v.picklist([...COMMANDABLE_GAITS, ...keys(POSTURES)])]),
    leave: v.strictTuple([v.picklist(keys(POSTURES))]),
    perform: v.strictTuple([v.picklist(ACTIONS)]),
    recover: v.strictTuple([], 'recover takes no argument'),
    set: v.strictTuple([
        v.variant('name', [
            v.strictObject({ name: v.literal('headlight'), value: v.picklist(COLOURS) }),
            v.strictObject({ name: v.literal('speed'), value: v.picklist(values(SPEED_LEVELS)) }),
            v.strictObject({ name: v.literal('obstacleAvoidance'), value: v.boolean() }),
        ]),
    ]),
    orient: v.strictTuple([finite, finite, finite]),
    dim: v.strictTuple([amount]),
    wait: v.strictTuple([amount]),
};

/// The schema of command `_name`'s arguments. It is generic in the name, so that the parsed
/// arguments keep the type `COMMANDS[_name]` takes.
const argsOf = <K extends keyof Params>(_name: K): v.GenericSchema<unknown, Params[K]> => ARGS[_name];

/// The cue command `_name` builds from `_args`, as a list of zero or one, and the issues the
/// arguments raise.
const compiled = <K extends keyof Params>(_name: K, _args: unknown) => {
    const parsed = v.safeParse(argsOf(_name), _args);
    return parsed.success ? { cues: [COMMANDS[_name](...parsed.output)], issues: [] } : { cues: [], issues: parsed.issues };
};

/// A cell of the sheet: a cue with an identifier, whose items are cells in turn.
export type Cell = Cue & { id: number; items: Cell[] };

/// A stored leaf runs its command, under its stored label and identifier. The issues of its
/// arguments are reported under `args`.
const leafSchema = v.pipe(
    v.strictObject({ id: v.number(), label: v.string(), name: v.picklist(keys(ARGS)), args: v.array(v.unknown()) }),
    v.rawTransform(({ dataset: { value }, addIssue, NEVER }) => {
        const { cues, issues } = compiled(value.name, value.args);
        pipe(
            issues,
            forEach((_issue) =>
                addIssue({
                    message: _issue.message,
                    path: [
                        { type: 'object', origin: 'value', input: value, key: 'args', value: value.args },
                        ...(_issue.path ?? []),
                    ],
                }),
            ),
        );
        return pipe(cues, map(merge({ id: value.id, label: value.label, items: [] })), first()) ?? NEVER;
    }),
);

/// A stored cell, looked up when parsed, because groups and cells refer to each other.
const cell = v.lazy(() => cellSchema);

/// A non-empty list of stored cells. The check runs first, so that `_message` alone reports an
/// empty list.
const cellsOf = (_message: string) =>
    v.pipe(v.array(v.unknown()), v.check(hasAtLeast(1), _message), v.tupleWithRest([cell], cell));

/// The group cell `_id`, which runs `_items` in order under `_label`. The label is kept as given,
/// so that a stored group reads back unchanged.
export const grouped = (_id: number, _label: string, _items: [Cell, ...Cell[]]): Cell =>
    merge(sequence(_label, ..._items), { id: _id, label: _label, items: _items });

const groupSchema: v.GenericSchema<unknown, Cell> = v.pipe(
    v.strictObject({ id: v.number(), label: v.string(), items: cellsOf('a group needs at least one cell') }),
    v.transform(({ id, label, items }) => grouped(id, label, items)),
);

/// A stored cell is a group when it has `items`, and a leaf otherwise, so that each reports its
/// own issues.
export const cellSchema: v.GenericSchema<unknown, Cell> = v.lazy((_input) =>
    isPlainObject(_input) && 'items' in _input ? groupSchema : leafSchema,
);

/// Every cell of `_cells` and of their groups, in pre-order.
const flat = <T extends { items: T[] }>(_cells: T[]): T[] => pipe(_cells, flatMap((_cell) => [_cell, ...flat(_cell.items)]));

/// The identifiers of `_cells` and of every cell nested in them.
const ids = (_cells: Cell[]) => pipe(flat(_cells), map(prop('id')));

/// Fails when two of the cells `_cellsOf` finds in the input, nested ones included, share an
/// identifier.
export const distinctIn = <T>(_cellsOf: (_input: T) => Cell[]) =>
    v.check(
        (_input: T) => pipe(ids(_cellsOf(_input)), (_ids) => unique(_ids).length === _ids.length),
        'two cells share an identifier',
    );

/// A stored sheet: a non-empty list of cells, each identifier held by one cell only.
export const sheetSchema = v.pipe(cellsOf('a sheet needs at least one cell'), distinctIn(identity()));

/// `_cues` as cells numbered in pre-order from `_first`: every cell of the tree, nested ones
/// included, gets its own identifier.
export const numbered = (_cues: Cue[], _first: number): Cell[] =>
    pipe(
        _cues,
        map((_cue, _index) => {
            const id = _first + flat(take(_cues, _index)).length;
            return merge(_cue, { id, items: numbered(_cue.items, id + 1) });
        }),
    );

/// An identifier no cell of `_cells`, nested ones included, holds: one above the highest.
export const nextId = (_cells: Cell[]) => Math.max(-1, ...ids(_cells)) + 1;

/// The stored form of a cell, which `sheetSchema` reads back.
type Stored = { id: number; label: string } & (Command | { items: Stored[] });

/// The JSON form of `_cell`: a leaf holds its one command; a group holds the stored forms of its
/// cells.
export const stored = (_cell: Cell): Stored =>
    merge(
        pick(_cell, ['id', 'label']),
        isEmpty(_cell.items) ? _cell.source[0] : { items: pipe(_cell.items, map(stored)) },
    );
