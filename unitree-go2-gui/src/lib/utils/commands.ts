import { reduce } from 'remeda';
import { ACTIONS, MODES } from '../data/sportCommands';
import type { Action, Gait, Mode, Posture } from '../data/sportCommands';
import { BRIGHTNESS, COLOURS, EULER, SETTINGS, SPEED_LEVELS } from '../data/settings';

type Setting = {
    [K in keyof typeof SETTINGS]: { name: K; value: RobotState[K] };
}[keyof typeof SETTINGS];

/// One request to the robot. `orient` and `dim` change nothing the interface tracks.
export type Command =
    | { kind: 'enter'; mode: Mode }
    | { kind: 'leave'; mode: Mode }
    | { kind: 'perform'; action: Action }
    | { kind: 'set'; setting: Setting }
    | { kind: 'orient'; x: number; y: number; z: number }
    | { kind: 'dim'; brightness: number };

type Sequence = { kind: 'sequence'; label?: string; items: [Cue, ...Cue[]] };

export type Cue = Command | { kind: 'wait'; seconds: number } | Sequence;

export const enter = (_mode: Mode): Command => ({ kind: 'enter', mode: _mode });
export const leave = (_mode: Mode): Command => ({ kind: 'leave', mode: _mode });
export const perform = (_action: Action): Command => ({ kind: 'perform', action: _action });
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
        case 'leave':
            return _cue.mode;
        case 'perform':
            return _cue.action;
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
    /// Null when the gait is unknown, as after a gait was left: the API does not say which gait
    /// follows. While the robot is in a posture, this keeps the gait it returns to on standing up.
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

/// True for a name that is a mode, so `enter` and `leave` accept it.
const isMode = (_name: string): _name is Mode => _name in MODES;

/// True for a mode whose `kind` is a gait; the other modes are postures.
const isGaitMode = (_mode: Mode): _mode is Extract<Mode, Gait> => MODES[_mode].kind === 'gait';

/// True for a gait the app can command. The robot reports gaits, such as Stairs, that have no command.
export const isEnterable = (_gait: Gait): _gait is Extract<Mode, Gait> => isMode(_gait) && isGaitMode(_gait);

/// The state once one command or wait has run, with `previousGait` not yet updated.
function step(_cue: Exclude<Cue, Sequence>, _state: RobotState): RobotState {
    switch (_cue.kind) {
        case 'enter':
            return isGaitMode(_cue.mode)
                ? { ..._state, gait: _cue.mode, posture: null }
                : { ..._state, posture: _cue.mode };
        case 'leave':
            return isGaitMode(_cue.mode) ? { ..._state, gait: null } : { ..._state, posture: null };
        case 'perform': {
            const action = ACTIONS[_cue.action];
            return 'posture' in action ? { ..._state, posture: action.posture } : _state;
        }
        case 'set':
            return { ..._state, [_cue.setting.name]: _cue.setting.value };
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

type Steps = [Cue, ...Cue[]];

/// The commands that bring the robot from its gait into each posture. Pose needs the robot to stop
/// first. JointLock is the posture StandUp ends in.
const POSTURE_ENTRY: Record<Posture, Steps> = {
    Pose: [perform('StopMove'), enter('Pose')],
    Sitting: [perform('Sit')],
    Lying: [perform('StandDown')],
    JointLock: [perform('StandUp')],
    Damp: [enter('Damp')],
};

/// The commands that bring the robot from each posture back into its gait.
const POSTURE_EXIT: Record<Posture, Steps> = {
    Pose: [leave('Pose')],
    Sitting: [perform('RiseSit')],
    Lying: [perform('StandUp'), perform('BalanceStand')],
    JointLock: [perform('BalanceStand')],
    Damp: [perform('RecoveryStand')],
};

/// One step is sent as it is; several are sent as a sequence named `_label`.
const chain = (_label: string, [_first, ..._rest]: Steps): Cue =>
    _rest.length === 0 ? _first : sequence(_label, _first, ..._rest);

/// The cue that brings the robot from `_posture` back into its gait, whichever gait that is.
export const leavePosture = (_posture: Posture): Cue => chain(`Exit ${_posture}`, POSTURE_EXIT[_posture]);

/// The cue that brings the robot from `_state` into `_target` by the smooth route: a posture is
/// left before a gait is entered, and Pose is entered only once the robot stops. From one posture
/// to another, this is the target's entry, which the robot refuses.
export function switchTo(_target: Extract<Mode, Gait> | Posture) {
    return function (_state: Pick<RobotState, 'gait' | 'posture'>): Cue {
        if (!(isMode(_target) && isGaitMode(_target)))
            return chain(`Enter ${_target}`, POSTURE_ENTRY[_target]);
        if (_state.posture === null) return enter(_target);
        const exit = POSTURE_EXIT[_state.posture];
        return _target === _state.gait
            ? leavePosture(_state.posture)
            : chain(`${_state.posture} → ${_target}`, [...exit, enter(_target)]);
    };
}

/// What the mode buttons show: the posture when there is one, otherwise the gait.
export const activeMode = (_state: Pick<RobotState, 'gait' | 'posture'>) => _state.posture ?? _state.gait;
