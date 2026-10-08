import { keys } from 'remeda';
import type { CommandName } from '../data/commands';
import { LIGHT_EMOJIS, SPEED_LEVELS } from '../data/options';
import type { Colour } from '../data/options';
import type { RobotState } from '../stores/robotState';
import { CMD_switches } from './payloads';
import type { CueItem, Payload } from './payloads';

type Parameter = NonNullable<Payload['parameter']>;

/// How one command's parameter determines the states it implies.
type Derivation = (_parameter: Parameter) => Partial<RobotState>;

type DerivationTable = Partial<Record<CommandName, Derivation>>;

function isColour(_value: unknown): _value is Colour {
    return typeof _value === 'string' && keys(LIGHT_EMOJIS).some(function (_colour) {
        return _colour === _value;
    });
}

/// The speed whose `SpeedLevel` data value this is, if any.
function speedOf(_data: unknown) {
    return keys(SPEED_LEVELS).find(function (_speed) {
        return SPEED_LEVELS[_speed] === _data;
    });
}

/// The states each non-mode command implies, by command name. A command absent from the table
/// implies nothing. A command missing the parameter its state reads implies nothing either, so
/// a malformed payload never moves a control.
const DERIVATIONS = {
    Headlight: (_parameter) => (isColour(_parameter.color) ? { headlight: _parameter.color } : {}),
    // The level is read from `data`, the key the robot receives, although the command table
    // names the argument `level`.
    SpeedLevel: (_parameter) => {
        const speed = speedOf(_parameter.data);
        return speed === undefined ? {} : { speed };
    },
    Sit: () => ({ sitting: true }),
    RiseSit: () => ({ sitting: false }),
    StandDown: () => ({ crouched: true }),
    StandUp: () => ({ crouched: false }),
    ObstaclesAvoid: (_parameter) =>
        typeof _parameter.enable === 'boolean' ? { obstacleAvoidance: _parameter.enable } : {},
} satisfies DerivationTable;

/// The derivation for a command, read through the table's declared type so that any command
/// name indexes it.
function derivationOf(_table: DerivationTable, _name: CommandName) {
    return _table[_name];
}

/// The commands a cue item sends, in the order it sends them, nested sequences opened out.
function commandsOf(_item: CueItem): Payload[] {
    switch (_item.kind) {
        case 'command':
            return [_item];
        case 'wait':
            return [];
        case 'sequence':
            return _item.sequence.flatMap(commandsOf);
    }
}

/// The states one command implies on its own.
function statesOf(_command: Payload) {
    const parameter = _command.parameter ?? {};
    const switchSpec = CMD_switches.find(function (_spec) {
        return _spec.command_name === _command.command_name;
    });
    if (switchSpec !== undefined) {
        // The boolean sits under the command's own argument name: `data` for most switches,
        // `enabled` for Damp.
        const on = parameter[switchSpec.args[0].name];
        return typeof on === 'boolean' ? { mode: on ? switchSpec.command_name : null } : {};
    }
    return derivationOf(DERIVATIONS, _command.command_name)?.(parameter) ?? {};
}

/// The state the robot should be in once a cue item has run, by state name. A state the item
/// does not affect is absent. Each state takes the value of the last command in the item that
/// affects it, so `exitPose`, which switches Pose off and then FreeWalk on, implies FreeWalk.
export function impliedStates(_item: CueItem) {
    return commandsOf(_item).reduce<Partial<RobotState>>(function (_states, _command) {
        return { ..._states, ...statesOf(_command) };
    }, {});
}
