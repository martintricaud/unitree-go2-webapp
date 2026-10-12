import { entries, omit, values } from 'remeda';
import { ACTIONS } from '../src/lib/data/actions.ts';
import { MODES } from '../src/lib/data/modes.ts';
import { BRIGHTNESS, EULER, SETTINGS } from '../src/lib/data/settings.ts';

/// Every command the frontend can encode, as the relay reads it from commands_1.1.7.json.
/// A command without `exec_time` gets the relay's floor timeout.
export const COMMAND_TABLE = [
    ...entries(MODES).map(([_name, _mode]) => ({
        command_name: _name,
        topic: 'SPORT_MOD',
        api_id: _mode.api_id,
        description: _mode.description,
    })),
    ...entries(ACTIONS).map(([_name, _action]) => ({
        command_name: _name,
        topic: 'SPORT_MOD',
        api_id: _action.api_id,
        description: _action.description,
        exec_time: _action.exec_time,
    })),
    ...values(SETTINGS).map((_setting) => omit(_setting, ['argument'])),
    omit(BRIGHTNESS, ['argument']),
    EULER,
];
