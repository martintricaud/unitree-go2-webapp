import { reduce } from 'remeda';
import { displayed } from './confirmable';
import type { Confirmable } from './confirmable';
import { SPORT_API } from '../data/sportApi';
import { BRIGHTNESS, COLOURS, EULER, SETTINGS, SPEED_LEVELS } from '../data/settings';

export type SportRequest = keyof typeof SPORT_API;

type FlagRequest = {
    [R in SportRequest]: (typeof SPORT_API)[R] extends { flag: true } ? R : never;
}[SportRequest];

/// One request a posture's entry or exit sends: a request without argument, or a flag request
/// with the flag it sends.
export type Step = Exclude<SportRequest, FlagRequest> | readonly [FlagRequest, boolean];

type Steps = readonly [Step, ...Step[]];

/// The ways the robot walks. In a gait the robot can walk, and standing still is part of the gait.
/// `enter` is the request that enters the gait; a gait without one is reported by the robot but
/// not commandable.
/// `codes` are the codes the robot reports in `error_code` under the motion-control mode "mcf"
/// while in the gait. They are transcribed from the official app by legion1581/unitree_ui; Unitree
/// does not document them. ClassicWalk and ContinuousGait have no known code.
export const GAITS = {
    FreeWalk: { enter: 'FreeWalk', codes: [0, 100] },
    StaticWalk: { enter: 'StaticWalk', codes: [1015] },
    Trotting: { enter: 'TrotRun', codes: [1016] },
    EconomicGait: { enter: 'EconomicGait', codes: [1017] },
    ClassicWalk: { enter: 'ClassicWalk', codes: [] },
    ContinuousGait: { enter: 'ContinuousGait', codes: [] },
    Leaping: { enter: 'FreeBound', codes: [2008] },
    Jumping: { enter: 'FreeJump', codes: [2009] },
    FreeAvoid: { enter: 'FreeAvoid', codes: [2007] },
    Handstand: { enter: 'HandStand', codes: [2011] },
    Backstand: { enter: 'WalkUpright', codes: [2017] },
    CrossStep: { enter: 'CrossStep', codes: [2016] },
    Stairs: { codes: [2010] },
    LeadFollow: { codes: [2019] },
    Rage: { codes: [2021] },
} as const satisfies Record<string, { enter?: SportRequest; codes: readonly number[] }>;

/// The states in which the robot cannot walk. `enter` brings the robot into the posture from its
/// gait, `exit` brings it back into the gait it had. Pose needs the robot to stop first. `codes`
/// are the "mcf" codes the robot reports in the posture.
export const POSTURES = {
    Pose: { enter: ['StopMove', ['Pose', true]], exit: [['Pose', false]], codes: [1091] },
    Sitting: { enter: ['Sit'], exit: ['RiseSit'], codes: [1007] },
    Lying: { enter: ['StandDown'], exit: ['StandUp', 'BalanceStand'], codes: [1004] },
    JointLock: { enter: ['StandUp'], exit: ['BalanceStand'], codes: [1002] },
    Damp: { enter: ['Damp'], exit: ['RecoveryStand'], codes: [1001] },
} as const satisfies Record<string, { enter: Steps; exit: Steps; codes: readonly number[] }>;

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

/// The code of balanceStand: the robot stands still in its gait, so it is in no posture. Unitree's
/// ROS 2 documentation separates balanceStand (standing) from locomotion (moving).
export const BALANCE_STAND_CODE = 1013;

/// The codes of "move" and "hello", which are transient and state nothing.
export const TRANSIENT_CODES = [1005, 1006] as const;

export type Gait = keyof typeof GAITS;
export type Posture = keyof typeof POSTURES;
export type Action = (typeof ACTIONS)[number];

type CommandableGait = {
    [G in Gait]: (typeof GAITS)[G] extends { enter: SportRequest } ? G : never;
}[Gait];

/// True for a gait the app can command.
export const isCommandable = (_gait: Gait): _gait is CommandableGait => 'enter' in GAITS[_gait];

/// True for a target that is a posture; the other targets are gaits.
export const isPosture = (_target: CommandableGait | Posture): _target is Posture => _target in POSTURES;

type Setting = {
    [K in keyof typeof SETTINGS]: { name: K; value: RobotState[K] };
}[keyof typeof SETTINGS];

/// One request to the robot. `orient` and `dim` change nothing the interface tracks.
export type Command =
    | { kind: 'enter'; target: CommandableGait | Posture }
    | { kind: 'leave'; posture: Posture }
    | { kind: 'perform'; action: Action }
    | { kind: 'recover' }
    | { kind: 'set'; setting: Setting }
    | { kind: 'orient'; x: number; y: number; z: number }
    | { kind: 'dim'; brightness: number };

type Sequence = { kind: 'sequence'; label?: string; items: [Cue, ...Cue[]] };

export type Cue = Command | { kind: 'wait'; seconds: number } | Sequence;

export const enter = (_target: CommandableGait | Posture): Command => ({ kind: 'enter', target: _target });
export const leave = (_posture: Posture): Command => ({ kind: 'leave', posture: _posture });
export const perform = (_action: Action): Command => ({ kind: 'perform', action: _action });
/// RecoveryStand: from any state, the robot stands in its gait, in no posture.
export const recover = (): Command => ({ kind: 'recover' });
export const set = (_setting: Setting): Command => ({ kind: 'set', setting: _setting });
export const orient = (_x: number, _y: number, _z: number): Command => ({
    kind: 'orient',
    x: _x,
    y: _y,
    z: _z,
});
export const dim = (_brightness: number): Command => ({ kind: 'dim', brightness: _brightness });
export const wait = (_seconds: number): Cue => ({ kind: 'wait', seconds: _seconds });

/// An empty label leaves the sequence unnamed.
export const sequence = (_label: string, ..._items: [Cue, ...Cue[]]): Sequence => ({
    kind: 'sequence',
    label: _label === '' ? undefined : _label,
    items: _items,
});

/// How the cue sheet and the outcome log name a cue.
export function cueLabel(_cue: Cue) {
    switch (_cue.kind) {
        case 'enter':
            return _cue.target;
        case 'leave':
            return `Exit ${_cue.posture}`;
        case 'perform':
            return _cue.action;
        case 'recover':
            return 'RecoveryStand';
        case 'set':
            return SETTINGS[_cue.setting.name].command_name;
        case 'orient':
            return EULER.command_name;
        case 'dim':
            return BRIGHTNESS.command_name;
        case 'wait':
            return `⏱ ${_cue.seconds}s`;
        case 'sequence':
            return _cue.label ?? 'unnamed sequence';
    }
}

export type RobotState = {
    /// Null when the gait is unknown. While the robot is in a posture, this keeps the gait it
    /// returns to on leaving the posture.
    gait: Gait | null;
    /// Null when the robot is in its gait.
    posture: Posture | null;
    /// The last known gait before the current one, so a toggle can return to it. It changes only
    /// when the gait changes from a known gait; entering or leaving a posture keeps it.
    previousGait: Gait;
    headlight: (typeof COLOURS)[number];
    speed: (typeof SPEED_LEVELS)[keyof typeof SPEED_LEVELS];
    obstacleAvoidance: boolean;
};

/// The state once one command or wait has run, with `previousGait` not yet updated.
function step(_cue: Exclude<Cue, Sequence>, _state: RobotState): RobotState {
    switch (_cue.kind) {
        case 'enter':
            return isPosture(_cue.target)
                ? { ..._state, posture: _cue.target }
                : { ..._state, gait: _cue.target, posture: null };
        case 'leave':
        case 'recover':
            return { ..._state, posture: null };
        case 'set':
            return { ..._state, [_cue.setting.name]: _cue.setting.value };
        case 'perform':
        case 'orient':
        case 'dim':
        case 'wait':
            return _state;
    }
}

/// The state the robot is in once the cue has run from `_state`. A sequence runs item by item, so
/// each gait change inside it updates `previousGait` in turn.
export function transition(_cue: Cue): (_state: RobotState) => RobotState {
    return function (_state) {
        if (_cue.kind === 'sequence')
            return reduce(_cue.items, (_reached, _item) => transition(_item)(_reached), _state);
        const reached = step(_cue, _state);
        return _state.gait !== null && reached.gait !== _state.gait
            ? { ...reached, previousGait: _state.gait }
            : reached;
    };
}

/// What the mode buttons show: the posture when there is one, otherwise the gait.
export const activeMode = (_state: Pick<RobotState, 'gait' | 'posture'>) => _state.posture ?? _state.gait;

/// Whether any of these fields is waiting for the robot's verdict.
const isWaiting =
    (..._fields: (keyof RobotState)[]) =>
    (_state: Confirmable<RobotState>) =>
        _fields.some((_field) => _state.pending[_field] !== undefined);

/// The toggle keys. Each asks for the opposite of what its control shows, so a refused command
/// leaves the next press asking for the same thing again. Each returns null while the toggled fields
/// wait for a verdict: the cue would read the pending value and queue the opposite command.
export const togglePosture = (_posture: Posture) => (_state: Confirmable<RobotState>) => {
    if (isWaiting('posture')(_state)) return null;
    return displayed(_state).posture === _posture ? leave(_posture) : enter(_posture);
};

/// A gait toggles back to the gait the robot had before it, or to FreeWalk when that gait is not
/// commandable.
export const toggleGait = (_gait: CommandableGait) => (_state: Confirmable<RobotState>) => {
    if (isWaiting('gait', 'posture')(_state)) return null;
    const shown = displayed(_state);
    if (shown.gait !== _gait || shown.posture !== null) return enter(_gait);
    return enter(isCommandable(shown.previousGait) ? shown.previousGait : 'FreeWalk');
};
