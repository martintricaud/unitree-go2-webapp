import { COMMANDS } from '../data/commands';
import type { CommandName, CommandSpec, SwitchName } from '../data/commands';
import type { Colour } from '../data/options';

/// One command as the relay receives it. `parameter` carries the command's arguments under the
/// names the robot expects, which are not always the names the command table gives them.
export type Payload = { kind: 'command'; parameter?: Record<string, unknown> } & Pick<
    CommandSpec,
    'api_id' | 'topic' | 'command_name'
>;

export type Wait = {
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

type Entry = (typeof COMMANDS)[number];

/// A working command that takes no argument, sent as a one-press button.
type ActionSpec = Extract<Entry, { working: true; args: readonly [] }>;

/// A working command that takes one boolean argument: one of the exclusive locomotion modes.
type SwitchSpec = Extract<Entry, { working: true; args: readonly [{ type: 'boolean' }] }>;

function isAction(_spec: Entry): _spec is ActionSpec {
    return _spec.working && _spec.args.length === 0;
}

function isSwitch(_spec: Entry): _spec is SwitchSpec {
    return _spec.working && _spec.args.length === 1 && _spec.args[0].type === 'boolean';
}

export const CMD_actions = COMMANDS.filter(isAction);
export const CMD_switches = COMMANDS.filter(isSwitch);

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

/// The message that switches a locomotion mode on or off. The boolean goes under the switch's
/// own argument name: `data` for most switches, `enabled` for Damp.
export function switchTo(_on: boolean) {
    return function (_name: SwitchName) {
        const argument = specNamed(CMD_switches, _name).args[0].name;
        return { parameter: { [argument]: _on }, ...buildPayload(_name) };
    };
}

export function dimTo(_brightness: number) {
    return function (_name: CommandName) {
        return { parameter: { brightness: _brightness }, ...buildPayload(_name) };
    };
}

export function changeTo(_colour: Colour) {
    return function (_name: CommandName) {
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
