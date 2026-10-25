import { describe, it, expect } from 'vitest';
import {
  activeMode,
  dim,
  enter,
  leave,
  orient,
  perform,
  recover,
  sequence,
  set,
  toggleGait,
  togglePosture,
  transition,
  wait,
} from './commands';
import type { Cue, RobotState, Step } from './commands';
import type { Confirmable } from './confirmable';
import { presets } from '../data/cues';

const INITIAL_ROBOT_STATE: RobotState = {
  gait: 'FreeWalk',
  posture: null,
  previousGait: 'FreeWalk',
  headlight: 'white',
  speed: 0,
  obstacleAvoidance: true,
};

const STATES: RobotState[] = [
  INITIAL_ROBOT_STATE,
  { gait: null, posture: 'Sitting', previousGait: 'Trotting', headlight: 'red', speed: -1, obstacleAvoidance: false },
  { gait: 'Trotting', posture: 'Lying', previousGait: 'StaticWalk', headlight: 'blue', speed: 1, obstacleAvoidance: true },
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

  it('enters a gait', () => {
    expect(transition(enter('Handstand'))(INITIAL_ROBOT_STATE).gait).toBe('Handstand');
  });

  it('clears the posture on entering a gait from a posture', () => {
    expect(transition(enter('Leaping'))(STATES[2])).toEqual({
      ...STATES[2],
      gait: 'Leaping',
      posture: null,
      previousGait: 'Trotting',
    });
  });

  it('keeps the gait on entering or leaving a posture', () => {
    expect(transition(enter('Pose'))(STATES[2])).toEqual({ ...STATES[2], posture: 'Pose' });
    expect(transition(enter('Damp'))(INITIAL_ROBOT_STATE)).toEqual({ ...INITIAL_ROBOT_STATE, posture: 'Damp' });
    expect(transition(enter('Sitting'))(INITIAL_ROBOT_STATE)).toEqual({ ...INITIAL_ROBOT_STATE, posture: 'Sitting' });
    expect(transition(enter('Lying'))(INITIAL_ROBOT_STATE).posture).toBe('Lying');
    expect(transition(enter('JointLock'))(STATES[2])).toEqual({ ...STATES[2], posture: 'JointLock' });
    (['Pose', 'Sitting', 'Lying', 'JointLock', 'Damp'] as const).forEach((posture) => {
      expect(transition(leave(posture))(STATES[2])).toEqual({ ...STATES[2], posture: null });
    });
  });

  it('clears the posture and keeps the gait on recovering, from any state', () => {
    STATES.forEach((state) => {
      expect(transition(recover())(state)).toEqual({ ...state, posture: null });
    });
  });

  it('leaves the gait as it was before sitting, and no posture, after sitting then rising', () => {
    STATES.forEach((state) => {
      expect(transition(sequence('', enter('Sitting'), leave('Sitting')))(state)).toEqual({ ...state, posture: null });
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
    // @ts-expect-error 'Sit' is a request, not a gait or a posture.
    enter('Sit');
    // @ts-expect-error 'Stairs' is a gait the robot reports but the app cannot command.
    enter('Stairs');
    // @ts-expect-error 'Pose' is a posture, not an action.
    perform('Pose');
    // @ts-expect-error 'Leaping' is a gait, not a posture, so it cannot be left.
    leave('Leaping');
    // @ts-expect-error 'Sit' takes no flag.
    const flagged: Step = ['Sit', true];
    expect(flagged).toBeDefined();
    // @ts-expect-error 'pink' is not a headlight colour.
    set({ name: 'headlight', value: 'pink' });
  });
});

describe('previousGait', () => {
  it('becomes the old gait when a command changes a known gait', () => {
    expect(transition(enter('Leaping'))(INITIAL_ROBOT_STATE)).toMatchObject({ gait: 'Leaping', previousGait: 'FreeWalk' });
  });

  it('is unchanged when the old gait is unknown', () => {
    expect(transition(enter('Leaping'))(STATES[1]).previousGait).toBe('Trotting');
  });

  it('is unchanged on re-entering the current gait', () => {
    expect(transition(enter('FreeWalk'))(INITIAL_ROBOT_STATE).previousGait).toBe('FreeWalk');
  });

  it('is unchanged on entering or leaving a posture', () => {
    [enter('Pose'), leave('Pose'), enter('Damp'), enter('Sitting'), leave('Sitting'), enter('Lying'), recover()].forEach((cue) => {
      STATES.forEach((state) => {
        expect(transition(cue)(state).previousGait).toBe(state.previousGait);
      });
    });
  });

  it('follows each gait change inside a sequence in turn', () => {
    const cue = sequence('', enter('Trotting'), enter('Sitting'), enter('Backstand'));
    expect(transition(cue)(INITIAL_ROBOT_STATE)).toMatchObject({ gait: 'Backstand', previousGait: 'Trotting' });
  });
});

/** A state in `gait` and `posture`, the other fields as in the initial state. */
const at = (gait: RobotState['gait'], posture: RobotState['posture']): RobotState => ({
  ...INITIAL_ROBOT_STATE,
  gait,
  posture,
});

/** `state` with nothing waiting for a verdict. */
const settled = (state: RobotState): Confirmable<RobotState> => ({ settled: state, pending: {} });

/** The robot state after each of `presses` cues, each built from the state before it and confirmed.
 * A press that returns no cue sends nothing and changes nothing. */
const run = (state: RobotState, presses: ((_state: Confirmable<RobotState>) => Cue | null)[]) =>
  presses.reduce<{ state: RobotState; sent: (Cue | null)[] }>(
    ({ state: before, sent }, press) => {
      const cue = press(settled(before));
      return { state: cue === null ? before : transition(cue)(before), sent: [...sent, cue] };
    },
    { state, sent: [] },
  );

describe('the toggle keys', () => {
  it('b from FreeWalk sends Leaping, then FreeWalk, then Leaping again', () => {
    const { sent, state } = run(INITIAL_ROBOT_STATE, [toggleGait('Leaping'), toggleGait('Leaping'), toggleGait('Leaping')]);
    expect(sent).toEqual([enter('Leaping'), enter('FreeWalk'), enter('Leaping')]);
    expect(state).toMatchObject({ gait: 'Leaping', previousGait: 'FreeWalk' });
  });

  it('b from StaticWalk, then b again, returns to StaticWalk', () => {
    const { sent, state } = run(at('StaticWalk', null), [toggleGait('Leaping'), toggleGait('Leaping')]);
    expect(sent).toEqual([enter('Leaping'), enter('StaticWalk')]);
    expect(state).toMatchObject({ gait: 'StaticWalk', previousGait: 'Leaping' });
  });

  it('b from Leaping after a gait the app cannot command switches to FreeWalk, and keeps toggling', () => {
    const { sent, state } = run({ ...at('Leaping', null), previousGait: 'Stairs' }, [
      toggleGait('Leaping'),
      toggleGait('Leaping'),
      toggleGait('Leaping'),
    ]);
    expect(sent).toEqual([enter('FreeWalk'), enter('Leaping'), enter('FreeWalk')]);
    expect(state).toMatchObject({ gait: 'FreeWalk', previousGait: 'Leaping' });
  });

  it('a from a gait sends StopMove and Pose on, then only Pose off', () => {
    const { sent, state } = run(at('Trotting', null), [togglePosture('Pose'), togglePosture('Pose')]);
    expect(sent).toEqual([enter('Pose'), leave('Pose')]);
    expect(state).toMatchObject({ gait: 'Trotting', posture: null, previousGait: 'FreeWalk' });
  });

  it('a out of Pose sends only Pose off when the gait is unknown', () => {
    expect(togglePosture('Pose')(settled(at(null, 'Pose')))).toEqual(leave('Pose'));
  });

  it("sends the target's own entry from a posture, without leaving the posture first", () => {
    expect(toggleGait('Leaping')(settled(at('FreeWalk', 'Sitting')))).toEqual(enter('Leaping'));
    expect(togglePosture('Pose')(settled(at('FreeWalk', 'Sitting')))).toEqual(enter('Pose'));
  });

  it('x sits from a gait, then rises', () => {
    const { sent } = run(at('FreeWalk', null), [togglePosture('Sitting'), togglePosture('Sitting')]);
    expect(sent).toEqual([enter('Sitting'), leave('Sitting')]);
  });

  it('returns no cue while a toggled field waits for a verdict, and a cue once another field waits', () => {
    const waiting = (field: keyof RobotState): Confirmable<RobotState> => ({
      settled: INITIAL_ROBOT_STATE,
      pending: { [field]: { value: INITIAL_ROBOT_STATE[field], reqId: 1 } },
    });
    [togglePosture('Pose'), togglePosture('Sitting'), toggleGait('Leaping')].forEach((toggle) => {
      expect(toggle(waiting('posture'))).toBeNull();
      expect(toggle(waiting('headlight'))).not.toBeNull();
    });
    expect(toggleGait('Leaping')(waiting('gait'))).toBeNull();
    [togglePosture('Pose'), togglePosture('Sitting')].forEach((toggle) => {
      expect(toggle(waiting('gait'))).not.toBeNull();
    });
  });
});
