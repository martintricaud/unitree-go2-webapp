import { describe, it, expect } from 'vitest';
import {
  buildPayload,
  CMD_actions,
  CMD_switches,
  CMD_switches_names,
} from './commandUtilities';

describe('commandUtilities', () => {
  describe('buildPayload', () => {
    it('should return api_id, topic, and command_name', () => {
      const result = buildPayload('BalanceStand');
      expect(result).toHaveProperty('api_id');
      expect(result).toHaveProperty('topic');
      expect(result).toHaveProperty('command_name');
      expect(result.api_id).toBe(1002);
      expect(result.topic).toBe('SPORT_MOD');
      expect(result.command_name).toBe('BalanceStand');
    });

    it('should return correct fields for another command', () => {
      const result = buildPayload('StandUp');
      expect(result.api_id).toBe(1004);
      expect(result.topic).toBe('SPORT_MOD');
      expect(result.command_name).toBe('StandUp');
    });
  });

  describe('CMD_actions', () => {
    it('should be an array', () => {
      expect(Array.isArray(CMD_actions)).toBe(true);
    });

    it('should contain commands with zero arguments', () => {
      expect(CMD_actions.length).toBeGreaterThan(0);
      CMD_actions.forEach((cmd) => {
        expect(cmd.args.length).toBe(0);
      });
    });

    it('should contain only working commands', () => {
      CMD_actions.forEach((cmd) => {
        expect(cmd.working).toBe(true);
      });
    });

    it('should include commands like BalanceStand, StandUp, StandDown', () => {
      const names = CMD_actions.map((c) => c.command_name);
      expect(names).toContain('BalanceStand');
      expect(names).toContain('StandUp');
      expect(names).toContain('StandDown');
    });
  });

  describe('CMD_switches', () => {
    it('should be an array', () => {
      expect(Array.isArray(CMD_switches)).toBe(true);
    });

    it('should contain commands with exactly one boolean argument', () => {
      expect(CMD_switches.length).toBeGreaterThan(0);
      CMD_switches.forEach((cmd) => {
        expect(cmd.args.length).toBe(1);
        expect(cmd.args[0].type).toBe('boolean');
      });
    });

    it('should contain only working commands', () => {
      CMD_switches.forEach((cmd) => {
        expect(cmd.working).toBe(true);
      });
    });

    it('should include Damp command which has one boolean arg', () => {
      const names = CMD_switches.map((c) => c.command_name);
      expect(names).toContain('Damp');
    });

    it('should not include zero-arg commands like BalanceStand', () => {
      const names = CMD_switches.map((c) => c.command_name);
      expect(names).not.toContain('BalanceStand');
    });
  });

  describe('CMD_switches_names', () => {
    it('should be an array of strings', () => {
      expect(Array.isArray(CMD_switches_names)).toBe(true);
      CMD_switches_names.forEach((name) => {
        expect(typeof name).toBe('string');
      });
    });

    it('should match CMD_switches command_names in same order', () => {
      const expected = CMD_switches.map((c) => c.command_name);
      expect(CMD_switches_names).toEqual(expected);
    });

    it('should include Damp', () => {
      expect(CMD_switches_names).toContain('Damp');
    });

    it('should have the same length as CMD_switches', () => {
      expect(CMD_switches_names.length).toBe(CMD_switches.length);
    });
  });
});
