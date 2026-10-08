import { describe, it, expect } from 'vitest';
import { buildPayload, changeTo, dimTo, switchTo, toggleTo } from './payloads';
import type { CueItem, Sequence } from './payloads';
import { presets, DANSE_DU_SABBAT } from '../data/cues';
import { SPEED_LEVELS } from '../data/options';
import { impliedStates } from './impliedStates';

/** The sequence in DANSE_DU_SABBAT that carries this display name. */
const sabbatStep = (displayName: string): Sequence => {
  const steps: readonly CueItem[] = DANSE_DU_SABBAT.sequence;
  const found = steps.find(
    (item): item is Sequence => item.kind === 'sequence' && item.displayName === displayName,
  );
  if (found === undefined) throw new Error(`no step named ${displayName}`);
  return found;
};

const speedPayload = (data: number): CueItem => ({
  ...buildPayload('SpeedLevel'),
  parameter: { data },
});

describe('impliedStates', () => {
  it('implies the mode a switch turns on', () => {
    expect(impliedStates(switchTo(true)('Pose'))).toEqual({ mode: 'Pose' });
  });

  it('implies no mode when a switch turns one off', () => {
    expect(impliedStates(switchTo(false)('Pose'))).toEqual({ mode: null });
  });

  it('reads the Damp boolean from parameter.enabled', () => {
    expect(switchTo(true)('Damp').parameter).toEqual({ enabled: true });
    expect(impliedStates(switchTo(true)('Damp'))).toEqual({ mode: 'Damp' });
    expect(impliedStates(switchTo(false)('Damp'))).toEqual({ mode: null });
  });

  it('implies nothing for a switch whose boolean is missing', () => {
    expect(impliedStates(buildPayload('Pose'))).toEqual({});
  });

  it('takes the last mode in a cue: exitPose ends on FreeWalk', () => {
    expect(impliedStates(presets.exitPose).mode).toBe('FreeWalk');
  });

  it('collects every state a cue affects: exitSit rises and walks', () => {
    expect(impliedStates(presets.exitSit)).toEqual({ sitting: false, mode: 'FreeWalk' });
  });

  it('opens nested sequences: Sabots ends on Backstand with a blue light', () => {
    const states = impliedStates(sabbatStep('Sabots'));
    expect(states.mode).toBe('Backstand');
    expect(states.headlight).toBe('blue');
  });

  it('lets a nested sequence override an earlier step of its parent', () => {
    expect(impliedStates(DANSE_DU_SABBAT)).toEqual({ mode: 'ClassicWalk', headlight: 'green' });
  });

  it('implies the headlight colour', () => {
    expect(impliedStates(changeTo('red')('Headlight'))).toEqual({ headlight: 'red' });
  });

  it('implies nothing for Brightness', () => {
    expect(impliedStates(dimTo(1)('Brightness'))).toEqual({});
  });

  it('maps each SpeedLevel data value onto its speed name', () => {
    Object.entries(SPEED_LEVELS).forEach(([name, data]) => {
      expect(impliedStates(speedPayload(data))).toEqual({ speed: name });
    });
  });

  it('implies nothing for a SpeedLevel outside the known values', () => {
    expect(impliedStates(speedPayload(7))).toEqual({});
  });

  it('implies sitting and crouching from their commands', () => {
    expect(impliedStates(buildPayload('Sit'))).toEqual({ sitting: true });
    expect(impliedStates(buildPayload('RiseSit'))).toEqual({ sitting: false });
    expect(impliedStates(buildPayload('StandDown'))).toEqual({ crouched: true });
    expect(impliedStates(buildPayload('StandUp'))).toEqual({ crouched: false });
  });

  it('implies the obstacle-avoidance boolean', () => {
    expect(impliedStates(toggleTo(false)('ObstaclesAvoid'))).toEqual({ obstacleAvoidance: false });
    expect(impliedStates(toggleTo(true)('ObstaclesAvoid'))).toEqual({ obstacleAvoidance: true });
  });

  it('implies nothing for a sequence of waits and non-state commands', () => {
    const cue: CueItem = {
      kind: 'sequence',
      sequence: [
        buildPayload('StopMove'),
        { kind: 'wait', wait: 0.1 },
        buildPayload('Hello'),
        { kind: 'sequence', sequence: [{ kind: 'wait', wait: 0.2 }, buildPayload('FingerHeart')] },
      ],
    };
    expect(impliedStates(cue)).toEqual({});
  });

  it('implies nothing for a headlight colour outside the known ones', () => {
    expect(impliedStates({ ...buildPayload('Headlight'), parameter: { color: 'mauve' } })).toEqual({});
  });

  it('implies nothing for a bare wait', () => {
    expect(impliedStates({ kind: 'wait', wait: 1 })).toEqual({});
  });
});
