import type { Action } from '../data/actions';
import type { Mode } from '../data/modes';
import type { RobotState } from '../data/robotState';
import { BRIGHTNESS, EULER, SETTINGS } from '../data/settings';

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

type Sequence = { kind: 'sequence'; label?: string; items: Cue[] };

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
export const sequence = (_label: string, ..._items: Cue[]): Sequence => ({
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
