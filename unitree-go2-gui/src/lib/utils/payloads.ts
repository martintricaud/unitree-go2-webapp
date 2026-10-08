import { COMMANDS } from '../data/commands';
import type { CommandName, SwitchName } from '../data/commands';
import type { Colour } from '../data/options';

type Entry = (typeof COMMANDS)[number];

/// One command as the relay receives it. Its fields are read from the command table's entries,
/// so `command_name` is a name the table holds. `parameter` carries the command's arguments
/// under the names the robot expects, which are not always the names the table gives them.
export type Payload = { kind: 'command'; parameter?: Record<string, unknown> } & Pick<
    Entry,
    'api_id' | 'topic' | 'command_name'
>;

type Wait = {
    kind: 'wait';
    wait: number;
};

export type Sequence = {
    kind: 'sequence';
    displayName?: string;
    sequence: CueItem[];
};

/// `kind` tells the reader of a cue item which of the three shapes it is holding, both in the
/// browser and on the relay, which dispatches on it.
export type CueItem = Payload | Wait | Sequence;

/// A working command that takes no argument, sent as a one-press button.
type ActionSpec = Extract<Entry, { working: true; args: readonly [] }>;

/// A working command that takes one boolean argument, under any topic.
type ToggleSpec = Extract<Entry, { working: true; args: readonly [{ type: 'boolean' }] }>;

/// One of the exclusive locomotion modes: a toggle under the sport-mode topic.
type SwitchSpec = Extract<Entry, { command_name: SwitchName }>;

/// The commands whose one argument is the headlight colour.
type ColourName = Extract<Entry, { args: readonly [{ name: 'color' }] }>['command_name'];

/// The commands whose one argument is the headlight brightness.
type BrightnessName = Extract<Entry, { args: readonly [{ name: 'brightness' }] }>['command_name'];

function isAction(_spec: Entry): _spec is ActionSpec {
    return _spec.working && _spec.args.length === 0;
}

function isToggle(_spec: Entry): _spec is ToggleSpec {
    return _spec.working && _spec.args.length === 1 && _spec.args[0].type === 'boolean';
}

function isSwitch(_spec: Entry): _spec is SwitchSpec {
    return isToggle(_spec) && _spec.topic === 'SPORT_MOD';
}

export const CMD_actions = COMMANDS.filter(isAction);
export const CMD_switches = COMMANDS.filter(isSwitch);
const CMD_toggles = COMMANDS.filter(isToggle);

/// The spec in this list that carries this name. The name's type guarantees it is in the list,
/// so the throw marks a table edited out of step with its own types.
function specNamed<S extends Entry>(_specs: readonly S[], _name: S['command_name']) {
    const spec = _specs.find(function (_spec) {
        return _spec.command_name === _name;
    });
    if (spec === undefined) throw new Error(`${_name} is not in the command table`);
    return spec;
}

/// The message that sends a command with no argument.
export function buildPayload(_name: CommandName) {
    const { api_id, topic, command_name } = specNamed(COMMANDS, _name);
    return { kind: 'command' as const, api_id, topic, command_name };
}

/// The message that turns a toggle on or off. The boolean goes under the toggle's own argument
/// name: `data` for most toggles, `enabled` for Damp, `enable` for ObstaclesAvoid.
export function toggleTo(_on: boolean) {
    return function (_name: ToggleSpec['command_name']) {
        const argument = specNamed(CMD_toggles, _name).args[0].name;
        return { parameter: { [argument]: _on }, ...buildPayload(_name) };
    };
}

/// The message that switches a locomotion mode on or off. It accepts only the modes, so a cue
/// cannot put a toggle from another topic where a mode is expected.
export function switchTo(_on: boolean) {
    return function (_name: SwitchName) {
        return toggleTo(_on)(_name);
    };
}

export function dimTo(_brightness: number) {
    return function (_name: BrightnessName) {
        return { parameter: { brightness: _brightness }, ...buildPayload(_name) };
    };
}

export function changeTo(_colour: Colour) {
    return function (_name: ColourName) {
        return { parameter: { color: _colour }, ...buildPayload(_name) };
    };
}

/// How a cue item is named wherever the operator reads it: the cue sheet, and the outcome log.
export const cueLabel = (_item: CueItem) => {
    switch (_item.kind) {
        case 'command':
            return _item.command_name;
        case 'wait':
            return `⏱ ${_item.wait}s`;
        case 'sequence':
            return _item.displayName ?? 'unnamed sequence';
    }
};
