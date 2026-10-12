import { describe, it, expect } from 'vitest';
import { INITIAL_ROBOT_STATE } from '../data/robotState';
import type { RobotState } from '../data/robotState';
import { dim, enter, leave, orient, perform, sequence, set, wait } from './commands';
import { presets } from '../data/cues';
import { transition } from './transition';

const STATES: RobotState[] = [
  INITIAL_ROBOT_STATE,
  { mode: null, posture: 'sitting', headlight: 'red', speed: -1, obstacleAvoidance: false },
  { mode: 'Pose', posture: 'lying', headlight: 'blue', speed: 1, obstacleAvoidance: true },
];

describe('transition', () => {
  it('ends in FreeWalk after leaving Pose and entering FreeWalk, from any state', () => {
    STATES.forEach((state) => {
      expect(transition(sequence('', leave('Pose'), enter('FreeWalk')))(state).mode).toBe('FreeWalk');
    });
  });

  it('enters a mode, and leaving one shows no mode', () => {
    expect(transition(enter('Handstand'))(INITIAL_ROBOT_STATE).mode).toBe('Handstand');
    expect(transition(leave('FreeWalk'))(INITIAL_ROBOT_STATE).mode).toBeNull();
  });

  it('sets the posture an action ends in', () => {
    expect(transition(perform('Sit'))(INITIAL_ROBOT_STATE).posture).toBe('sitting');
    expect(transition(perform('StandDown'))(INITIAL_ROBOT_STATE).posture).toBe('lying');
    expect(transition(perform('RiseSit'))(STATES[1]).posture).toBe('standing');
    expect(transition(perform('StandUp'))(STATES[2]).posture).toBe('standing');
  });

  it('is the identity for an action with no posture, an orientation, a dim and a wait', () => {
    [perform('Hello'), orient(0, -1, 0), dim(4), wait(1)].forEach((cue) => {
      STATES.forEach((state) => {
        expect(transition(cue)(state)).toEqual(state);
      });
    });
  });

  it('sets exactly the field a setting names', () => {
    expect(transition(set({ name: 'headlight', value: 'cyan' }))(INITIAL_ROBOT_STATE)).toEqual({
      ...INITIAL_ROBOT_STATE,
      headlight: 'cyan',
    });
    expect(transition(set({ name: 'speed', value: 1 }))(INITIAL_ROBOT_STATE).speed).toBe(1);
  });

  it('composes a sequence left to right, nested sequences included', () => {
    const cue = sequence('', enter('Pose'), sequence('', presets.exitSit, set({ name: 'headlight', value: 'red' })));
    expect(transition(cue)(STATES[1])).toEqual({ ...STATES[1], mode: 'FreeWalk', posture: 'standing', headlight: 'red' });
  });

  it('refuses commands that do not exist, at compile time', () => {
    // @ts-expect-error 'Sit' is an action, not a mode.
    enter('Sit');
    // @ts-expect-error 'Pose' is a mode, not an action.
    perform('Pose');
    // @ts-expect-error 'pink' is not a headlight colour.
    set({ name: 'headlight', value: 'pink' });
  });
});
