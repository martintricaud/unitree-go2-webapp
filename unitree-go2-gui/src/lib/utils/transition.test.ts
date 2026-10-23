import { describe, it, expect } from 'vitest';
import { activeMode, dim, enter, leave, orient, perform, sequence, set, transition, wait } from './commands';
import type { RobotState } from './commands';
import { presets } from '../data/cues';

const INITIAL_ROBOT_STATE: RobotState = {
  gait: 'FreeWalk',
  posture: null,
  headlight: 'white',
  speed: 0,
  obstacleAvoidance: true,
};

const STATES: RobotState[] = [
  INITIAL_ROBOT_STATE,
  { gait: null, posture: 'Sitting', headlight: 'red', speed: -1, obstacleAvoidance: false },
  { gait: 'Trotting', posture: 'Lying', headlight: 'blue', speed: 1, obstacleAvoidance: true },
];

describe('transition', () => {
  it('ends in FreeWalk, in no posture, after leaving Pose and entering FreeWalk, from any state', () => {
    STATES.forEach((state) => {
      expect(transition(sequence('', leave('Pose'), enter('FreeWalk')))(state)).toMatchObject({
        gait: 'FreeWalk',
        posture: null,
      });
    });
  });

  it('enters a gait, and leaving a gait sets the gait to null', () => {
    expect(transition(enter('Handstand'))(INITIAL_ROBOT_STATE).gait).toBe('Handstand');
    expect(transition(leave('FreeWalk'))(INITIAL_ROBOT_STATE)).toEqual({ ...INITIAL_ROBOT_STATE, gait: null });
  });

  it('clears the posture on entering a gait from a posture', () => {
    expect(transition(enter('Leaping'))(STATES[2])).toEqual({ ...STATES[2], gait: 'Leaping', posture: null });
  });

  it('keeps the gait on entering or leaving a posture mode', () => {
    expect(transition(enter('Pose'))(STATES[2])).toEqual({ ...STATES[2], posture: 'Pose' });
    expect(transition(enter('Damp'))(INITIAL_ROBOT_STATE)).toEqual({ ...INITIAL_ROBOT_STATE, posture: 'Damp' });
    expect(transition(leave('Pose'))(STATES[2])).toEqual({ ...STATES[2], posture: null });
  });

  it('sets the posture an action leaves the robot in, and keeps the gait', () => {
    expect(transition(perform('Sit'))(INITIAL_ROBOT_STATE)).toEqual({ ...INITIAL_ROBOT_STATE, posture: 'Sitting' });
    expect(transition(perform('StandDown'))(INITIAL_ROBOT_STATE).posture).toBe('Lying');
    expect(transition(perform('StandUp'))(STATES[2])).toEqual({ ...STATES[2], posture: 'JointLock' });
    (['RiseSit', 'RecoveryStand', 'BalanceStand'] as const).forEach((action) => {
      expect(transition(perform(action))(STATES[2])).toEqual({ ...STATES[2], posture: null });
    });
  });

  it('leaves the gait as it was before Sit, and no posture, after Sit then RiseSit', () => {
    STATES.forEach((state) => {
      expect(transition(sequence('', perform('Sit'), perform('RiseSit')))(state)).toEqual({ ...state, posture: null });
    });
  });

  it('shows the posture when there is one, otherwise the gait', () => {
    expect(activeMode(INITIAL_ROBOT_STATE)).toBe('FreeWalk');
    expect(activeMode(STATES[2])).toBe('Lying');
    expect(activeMode({ gait: null, posture: null })).toBeNull();
  });

  it('is the identity for a one-shot action, an orientation, a dim and a wait', () => {
    [perform('Hello'), perform('FrontFlip'), perform('StopMove'), orient(0, -1, 0), dim(4), wait(1)].forEach((cue) => {
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
    expect(transition(cue)(STATES[1])).toEqual({ ...STATES[1], gait: 'FreeWalk', posture: null, headlight: 'red' });
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
