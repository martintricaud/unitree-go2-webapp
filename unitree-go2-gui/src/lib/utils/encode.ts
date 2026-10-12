import { ACTIONS } from '../data/actions';
import { MODES } from '../data/modes';
import { BRIGHTNESS, EULER, SETTINGS } from '../data/settings';
import type { Cue } from './commands';

/// A cue as the relay reads it.
type Wire =
    | {
          kind: 'command';
          topic: string;
          api_id: number;
          command_name: string;
          parameter?: Record<string, unknown>;
      }
    | { kind: 'wait'; wait: number }
    | { kind: 'sequence'; displayName?: string; sequence: Wire[] };

export function encode(_cue: Cue): Wire {
    switch (_cue.kind) {
        case 'enter':
        case 'leave':
            return {
                kind: 'command',
                topic: 'SPORT_MOD',
                api_id: MODES[_cue.mode].api_id,
                command_name: _cue.mode,
                parameter: { [MODES[_cue.mode].argument]: _cue.kind === 'enter' },
            };
        case 'perform':
            return {
                kind: 'command',
                topic: 'SPORT_MOD',
                api_id: ACTIONS[_cue.action].api_id,
                command_name: _cue.action,
            };
        case 'set': {
            const { topic, api_id, command_name, argument } = SETTINGS[_cue.setting.name];
            return {
                kind: 'command',
                topic,
                api_id,
                command_name,
                parameter: { [argument]: _cue.setting.value },
            };
        }
        case 'orient':
            return {
                kind: 'command',
                topic: EULER.topic,
                api_id: EULER.api_id,
                command_name: EULER.command_name,
                parameter: { x: _cue.x, y: _cue.y, z: _cue.z },
            };
        case 'dim':
            return {
                kind: 'command',
                topic: BRIGHTNESS.topic,
                api_id: BRIGHTNESS.api_id,
                command_name: BRIGHTNESS.command_name,
                parameter: { [BRIGHTNESS.argument]: _cue.brightness },
            };
        case 'wait':
            return { kind: 'wait', wait: _cue.seconds };
        case 'sequence':
            return { kind: 'sequence', displayName: _cue.label, sequence: _cue.items.map(encode) };
    }
}
