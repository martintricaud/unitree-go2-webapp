import { mergeAll } from 'remeda';
import { SPORT_API } from '../data/sportApi';
import { BRIGHTNESS, COLOURS, EULER, SETTINGS, SPEED_LEVELS } from '../data/settings';

export type SportRequest = keyof typeof SPORT_API;

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

export type Gait = keyof typeof GAITS;
export type Posture = keyof typeof POSTURES;
export type Action = (typeof ACTIONS)[number];

export type CommandableGait = {
    [G in Gait]: (typeof GAITS)[G] extends { enter: SportRequest } ? G : never;
}[Gait];

/// True for a gait the app can command.
export const isCommandable = (_gait: Gait): _gait is CommandableGait => 'enter' in GAITS[_gait];

/// True for a target that is a posture; the other targets are gaits.
export const isPosture = (_target: CommandableGait | Posture): _target is Posture => _target in POSTURES;

type Setting = {
    [K in keyof typeof SETTINGS]: { name: K; value: RobotState[K] };
}[keyof typeof SETTINGS];

/// One message the relay sends to the robot, or a pause between two of them.
export type Step =
    | { kind: 'command'; topic: string; api_id: number; command_name: string; parameter?: Record<string, unknown> }
    | { kind: 'wait'; wait: number };

/// What the operator fires. `label` names it in the cue sheet and the outcome log; `steps` are the
/// messages it sends, in order; `changes` are the fields it changes in `RobotState`, in order.
export type Cue = { label: string; steps: Step[]; changes: Partial<RobotState>[] };

/// One sport request. A flag request carries `_flag`; a request without flag takes no argument.
const sportCommand = (_request: SportRequest, _flag = true): Step => ({
    kind: 'command',
    topic: 'SPORT_MOD',
    api_id: SPORT_API[_request].api_id,
    command_name: _request,
    ...('flag' in SPORT_API[_request] ? { parameter: { data: _flag } } : {}),
});

const stepCommand = (_request: PostureRequest) =>
    typeof _request === 'string' ? sportCommand(_request) : sportCommand(_request[0], _request[1]);

/// Entering a posture keeps the gait; entering a gait leaves any posture.
export const enter = (_target: CommandableGait | Posture): Cue =>
    isPosture(_target)
        ? { label: _target, steps: POSTURES[_target].enter.map(stepCommand), changes: [{ posture: _target }] }
        : {
              label: _target,
              steps: [sportCommand(GAITS[_target].enter)],
              changes: [{ gait: _target, posture: null }],
          };

export const leave = (_posture: Posture): Cue => ({
    label: `Exit ${_posture}`,
    steps: POSTURES[_posture].exit.map(stepCommand),
    changes: [{ posture: null }],
});

export const perform = (_action: Action): Cue => ({ label: _action, steps: [sportCommand(_action)], changes: [] });

/// RecoveryStand: from any state, the robot stands in its gait, in no posture.
export const recover = (): Cue => ({
    label: 'RecoveryStand',
    steps: [sportCommand('RecoveryStand')],
    changes: [{ posture: null }],
});

export const set = (_setting: Setting): Cue => {
    const { topic, api_id, command_name, argument } = SETTINGS[_setting.name];
    return {
        label: command_name,
        steps: [{ kind: 'command', topic, api_id, command_name, parameter: { [argument]: _setting.value } }],
        changes: [{ [_setting.name]: _setting.value }],
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
});

export const wait = (_seconds: number): Cue => ({
    label: `⏱ ${_seconds}s`,
    steps: [{ kind: 'wait', wait: _seconds }],
    changes: [],
});

/// Runs its items one after the other, as one cue. An empty label leaves the sequence unnamed.
export const sequence = (_label: string, ..._items: [Cue, ...Cue[]]): Cue => ({
    label: _label === '' ? 'unnamed sequence' : _label,
    steps: _items.flatMap((_item) => _item.steps),
    changes: _items.flatMap((_item) => _item.changes),
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
export const transition =
    (_cue: Cue) =>
    (_state: RobotState): RobotState => ({ ..._state, ...mergeAll(_cue.changes) });

/// What the mode buttons show: the posture when there is one, otherwise the gait.
export const activeMode = (_state: Pick<RobotState, 'gait' | 'posture'>) => _state.posture ?? _state.gait;
