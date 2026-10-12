import { describe, it, expect } from 'vitest';
import { keys } from 'remeda';
import onDisk from '../../../../commands_1.1.7.json';
import { COMMAND_TABLE } from '../../../scripts/commandTable';
import { ACTIONS } from './actions';

describe('the command table', () => {
  it('matches commands_1.1.7.json, so a hand edit of either file fails here', () => {
    expect(onDisk).toEqual(COMMAND_TABLE);
  });

  it('gives an exec_time to the actions and to nothing else', () => {
    const timed = COMMAND_TABLE.filter((_entry) => 'exec_time' in _entry).map((_entry) => _entry.command_name);
    expect(timed).toEqual(keys(ACTIONS));
  });

  it('names every command once', () => {
    const names = COMMAND_TABLE.map((_entry) => _entry.command_name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every command a description', () => {
    COMMAND_TABLE.forEach((_entry) => {
      expect(typeof _entry.description).toBe('string');
    });
  });
});
