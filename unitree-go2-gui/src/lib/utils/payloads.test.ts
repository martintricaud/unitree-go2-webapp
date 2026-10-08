import { describe, it, expect, expectTypeOf } from 'vitest';
import { buildPayload, changeTo, dimTo, switchTo, toggleTo, CMD_actions, CMD_switches } from './payloads';
import type { CueItem, Payload } from './payloads';
import type { CommandName } from '../data/commands';
import { presets, CONDUITE } from '../data/cues';

const KINDS = ['command', 'wait', 'sequence'];

/** Every cue item the sheet holds, nested sequences opened out. */
const everyItem = (items: CueItem[]): CueItem[] =>
  items.flatMap((item) => (item.kind === 'sequence' ? [item, ...everyItem(item.sequence)] : [item]));

describe('payloads', () => {
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

  describe('the types read from the command table', () => {
    it('should type a payload command_name as a name the table holds', () => {
      expectTypeOf<Payload['command_name']>().toEqualTypeOf<CommandName>();
    });

    it('should accept only a colour command in changeTo', () => {
      expectTypeOf(changeTo('red')).parameter(0).toEqualTypeOf<'Headlight'>();
      // @ts-expect-error 'Pose' takes no `color` argument.
      changeTo('red')('Pose');
    });

    it('should accept only a brightness command in dimTo', () => {
      expectTypeOf(dimTo(1)).parameter(0).toEqualTypeOf<'Brightness'>();
      // @ts-expect-error 'Headlight' takes no `brightness` argument.
      dimTo(1)('Headlight');
    });

    it('should keep ObstaclesAvoid out of the modes while it remains a toggle', () => {
      // @ts-expect-error ObstaclesAvoid is not under the sport-mode topic, so it is not a mode.
      switchTo(true)('ObstaclesAvoid');
      expect(toggleTo(true)('ObstaclesAvoid')).toEqual({
        kind: 'command',
        topic: 'OBSTACLES_AVOID',
        api_id: 1001,
        command_name: 'ObstaclesAvoid',
        parameter: { enable: true },
      });
    });
  });

  describe('the switch names', () => {
    it('should be the 14 locomotion modes, in table order', () => {
      expect(CMD_switches.map((cmd) => cmd.command_name)).toEqual([
        'Damp',
        'ContinuousGait',
        'Pose',
        'StaticWalk',
        'Trotting',
        'EconomicGait',
        'Handstand',
        'FreeWalk',
        'Leaping',
        'Jumping',
        'FreeAvoid',
        'ClassicWalk',
        'Backstand',
        'CrossStep',
      ]);
    });

    it("should put the boolean under Damp's own argument name", () => {
      expect(switchTo(false)('Damp').parameter).toEqual({ enabled: false });
    });
  });
});
