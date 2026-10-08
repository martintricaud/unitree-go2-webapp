import { describe, it, expect } from 'vitest';
import {
  buildPayload,
  switchTo,
  presets,
  CONDUITE,
  CMD_actions,
  CMD_switches,
  CMD_switches_names,
} from './commandUtilities';
import type { CueItem } from './commandUtilities';

const KINDS = ['command', 'wait', 'sequence'];

/** Every cue item the sheet holds, nested sequences opened out. */
const everyItem = (items: CueItem[]): CueItem[] =>
  items.flatMap((item) => (item.kind === 'sequence' ? [item, ...everyItem(item.sequence)] : [item]));

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

    it("should mark what it returns as kind 'command'", () => {
      expect(buildPayload('BalanceStand').kind).toBe('command');
    });
  });

  describe('the cue-item discriminant', () => {
    it("should mark a switchTo payload as kind 'command', alongside its parameter", () => {
      const result = switchTo(true)('Pose');
      expect(result.kind).toBe('command');
      expect(result.command_name).toBe('Pose');
      expect(result.parameter).toEqual({ data: true });
    });

    it("should mark every preset as kind 'sequence'", () => {
      expect(Object.keys(presets).length).toBeGreaterThan(0);
      Object.values(presets).forEach((preset) => {
        expect(preset.kind).toBe('sequence');
      });
    });

    it('should give every element of CONDUITE.sequence a kind field', () => {
      expect(CONDUITE.sequence.length).toBeGreaterThan(0);
      CONDUITE.sequence.forEach((item) => {
        expect(KINDS).toContain(item.kind);
      });
    });

    it('should give every item nested anywhere in CONDUITE a kind field', () => {
      const items = everyItem(CONDUITE.sequence);
      expect(items.length).toBeGreaterThan(CONDUITE.sequence.length);
      items.forEach((item) => {
        expect(KINDS).toContain(item.kind);
      });
    });

    it("should mark every wait as kind 'wait' and keep its wait field", () => {
      const waits = everyItem(CONDUITE.sequence).filter((item) => 'wait' in item);
      expect(waits.length).toBeGreaterThan(0);
      waits.forEach((item) => {
        expect(item.kind).toBe('wait');
        expect(typeof item.wait).toBe('number');
      });
    });

    it('should let a reader tell a command from a sequence by kind alone', () => {
      const named = everyItem(CONDUITE.sequence).map((item) =>
        item.kind === 'command' ? item.command_name : item.kind === 'sequence' ? item.displayName : `wait ${item.wait}`,
      );
      expect(named).toContain('Sabots');
      expect(named).toContain('FingerHeart');
      expect(named).toContain('wait 0.05');
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
