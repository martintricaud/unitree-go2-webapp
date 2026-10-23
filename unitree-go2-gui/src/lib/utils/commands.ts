import { reduce } from 'remeda';
import { ACTIONS } from '../data/actions';
import type { Action } from '../data/actions';
import type { Mode } from '../data/modes';
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
    /// Null once a mode was left: the API does not say which mode follows.
    mode: Mode | null;
    posture: Extract<(typeof ACTIONS)[Action], { posture: string }>['posture'];
    headlight: (typeof COLOURS)[number];
    speed: (typeof SPEED_LEVELS)[keyof typeof SPEED_LEVELS];
    obstacleAvoidance: boolean;
};

/// The state the robot is in once the cue has run from `_state`.
export function transition(_cue: Cue): (_state: RobotState) => RobotState {
    return function (_state) {
        switch (_cue.kind) {
            case 'enter':
                return { ..._state, mode: _cue.mode };
            case 'leave':
                return { ..._state, mode: null };
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
            case 'sequence':
                return reduce(_cue.items, (_reached, _item) => transition(_item)(_reached), _state);
        }
    };
}
