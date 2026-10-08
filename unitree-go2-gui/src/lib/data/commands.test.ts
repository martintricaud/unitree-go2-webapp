import { describe, it, expect } from 'vitest';
import onDisk from '../../../../commands_1.1.7.json';
import { COMMANDS } from './commands';
import { buildPayload, switchTo } from '../utils/payloads';

describe('the command table', () => {
  it('matches commands_1.1.7.json, so a hand edit of either file fails here', () => {
    expect(onDisk).toEqual(COMMANDS);
  });

  it('names every command once', () => {
    const names = COMMANDS.map((cmd) => cmd.command_name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('refuses a misspelt command name, at compile time and at run time', () => {
    // @ts-expect-error 'FreeWlak' is not a CommandName.
    expect(() => buildPayload('FreeWlak')).toThrow();
  });

  it('refuses a command that is not a switch where a switch is expected', () => {
    // @ts-expect-error 'Sit' takes no boolean argument, so it is not a SwitchName.
    expect(() => switchTo(true)('Sit')).toThrow();
  });
});
