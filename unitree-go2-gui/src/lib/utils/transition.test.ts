import { describe, it, expect } from 'vitest';
import { activeMode, dim, enter, isEnterable, leave, leavePosture, orient, perform, sequence, set, switchTo, transition, wait } from './commands';
import type { Cue, RobotState } from './commands';
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

  it('enters a gait, and leaving a gait sets the gait to null', () => {
    expect(transition(enter('Handstand'))(INITIAL_ROBOT_STATE).gait).toBe('Handstand');
    expect(transition(leave('Trotting'))(STATES[2])).toEqual({ ...STATES[2], gait: null, previousGait: 'Trotting' });
  });

  it('clears the posture on entering a gait from a posture', () => {
    expect(transition(enter('Leaping'))(STATES[2])).toEqual({
      ...STATES[2],
      gait: 'Leaping',
      posture: null,
      previousGait: 'Trotting',
    });
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
    [enter('Pose'), leave('Pose'), enter('Damp'), perform('Sit'), perform('RiseSit'), perform('StandDown')].forEach((cue) => {
      STATES.forEach((state) => {
        expect(transition(cue)(state).previousGait).toBe(state.previousGait);
      });
    });
  });

  it('follows each gait change inside a sequence in turn', () => {
    const cue = sequence('', enter('Trotting'), perform('Sit'), enter('Backstand'));
    expect(transition(cue)(INITIAL_ROBOT_STATE)).toMatchObject({ gait: 'Backstand', previousGait: 'Trotting' });
  });
});

/** A state in `gait` and `posture`, the other fields as in the initial state. */
const at = (gait: RobotState['gait'], posture: RobotState['posture']): RobotState => ({
  ...INITIAL_ROBOT_STATE,
  gait,
  posture,
});

describe('switchTo', () => {
  it('enters a gait from a gait', () => {
    expect(switchTo('Leaping')(at('FreeWalk', null))).toEqual(enter('Leaping'));
    expect(switchTo('FreeWalk')(at('FreeWalk', null))).toEqual(enter('FreeWalk'));
  });

  it('stops before entering Pose from a gait', () => {
    expect(switchTo('Pose')(at('FreeWalk', null))).toEqual(sequence('Enter Pose', perform('StopMove'), enter('Pose')));
  });

  it('sits, lies down and enters Damp from a gait', () => {
    expect(switchTo('Sitting')(at('FreeWalk', null))).toEqual(perform('Sit'));
    expect(switchTo('Lying')(at('FreeWalk', null))).toEqual(perform('StandDown'));
    expect(switchTo('Damp')(at('FreeWalk', null))).toEqual(enter('Damp'));
  });

  it('leaves Pose, then enters the target gait only if it is not the current gait', () => {
    expect(switchTo('FreeWalk')(at('FreeWalk', 'Pose'))).toEqual(leave('Pose'));
    expect(switchTo('Leaping')(at('FreeWalk', 'Pose'))).toEqual(
      sequence('Pose → Leaping', leave('Pose'), enter('Leaping')),
    );
  });

  it('rises from Sitting, then enters the target gait if needed', () => {
    expect(switchTo('Trotting')(at('Trotting', 'Sitting'))).toEqual(perform('RiseSit'));
    expect(switchTo('Leaping')(at('Trotting', 'Sitting'))).toEqual(
      sequence('Sitting → Leaping', perform('RiseSit'), enter('Leaping')),
    );
  });

  it('stands up and balances from Lying, then enters the target gait if needed', () => {
    expect(switchTo('FreeWalk')(at('FreeWalk', 'Lying'))).toEqual(
      sequence('Exit Lying', perform('StandUp'), perform('BalanceStand')),
    );
    expect(switchTo('Leaping')(at('FreeWalk', 'Lying'))).toEqual(
      sequence('Lying → Leaping', perform('StandUp'), perform('BalanceStand'), enter('Leaping')),
    );
  });

  it('balances from JointLock, then enters the target gait if needed', () => {
    expect(switchTo('FreeWalk')(at('FreeWalk', 'JointLock'))).toEqual(perform('BalanceStand'));
    expect(switchTo('Leaping')(at('FreeWalk', 'JointLock'))).toEqual(
      sequence('JointLock → Leaping', perform('BalanceStand'), enter('Leaping')),
    );
  });

  it('recovers from Damp, then enters the target gait if needed', () => {
    expect(switchTo('FreeWalk')(at('FreeWalk', 'Damp'))).toEqual(perform('RecoveryStand'));
    expect(switchTo('Leaping')(at('FreeWalk', 'Damp'))).toEqual(
      sequence('Damp → Leaping', perform('RecoveryStand'), enter('Leaping')),
    );
  });

  it('enters the target gait after leaving a posture when the gait is unknown', () => {
    expect(switchTo('Leaping')(at(null, 'Sitting'))).toEqual(
      sequence('Sitting → Leaping', perform('RiseSit'), enter('Leaping')),
    );
  });

  it("returns the target's entry from another posture", () => {
    expect(switchTo('Pose')(at('FreeWalk', 'Sitting'))).toEqual(switchTo('Pose')(at('FreeWalk', null)));
  });

  it("equals the posture's exit when the target is the current gait", () => {
    (['Pose', 'Sitting', 'Lying', 'JointLock', 'Damp'] as const).forEach((posture) => {
      expect(switchTo('Trotting')(at('Trotting', posture))).toEqual(leavePosture(posture));
    });
  });
});

/** The robot state after each of `presses` cues, each built from the state before it and confirmed. */
const run = (state: RobotState, presses: ((_state: RobotState) => Cue)[]) =>
  presses.reduce<{ state: RobotState; sent: Cue[] }>(
    ({ state: before, sent }, press) => {
      const cue = press(before);
      return { state: transition(cue)(before), sent: [...sent, cue] };
    },
    { state, sent: [] },
  );

/** The b key as App.svelte binds it: from Leaping in no posture, back to the previous gait; otherwise
 * into Leaping. */
const pressB = (state: RobotState): Cue => {
  if (state.gait !== 'Leaping' || state.posture !== null) return switchTo('Leaping')(state);
  return switchTo(isEnterable(state.previousGait) ? state.previousGait : 'FreeWalk')(state);
};

/** The a key as App.svelte binds it: out of Pose into the gait, otherwise into Pose. */
const pressA = (state: RobotState): Cue =>
  state.posture === 'Pose' ? leavePosture('Pose') : switchTo('Pose')(state);

describe('the toggle keys', () => {
  it('b from FreeWalk sends Leaping, then FreeWalk, then Leaping again', () => {
    const { sent, state } = run(INITIAL_ROBOT_STATE, [pressB, pressB, pressB]);
    expect(sent).toEqual([enter('Leaping'), enter('FreeWalk'), enter('Leaping')]);
    expect(state).toMatchObject({ gait: 'Leaping', previousGait: 'FreeWalk' });
  });

  it('b from StaticWalk, then b again, returns to StaticWalk', () => {
    const { sent, state } = run(at('StaticWalk', null), [pressB, pressB]);
    expect(sent).toEqual([enter('Leaping'), enter('StaticWalk')]);
    expect(state).toMatchObject({ gait: 'StaticWalk', previousGait: 'Leaping' });
  });

  it('b from Leaping after a gait the app cannot command switches to FreeWalk, and keeps toggling', () => {
    const { sent, state } = run({ ...at('Leaping', null), previousGait: 'Stairs' }, [pressB, pressB, pressB]);
    expect(sent).toEqual([enter('FreeWalk'), enter('Leaping'), enter('FreeWalk')]);
    expect(state).toMatchObject({ gait: 'FreeWalk', previousGait: 'Leaping' });
  });

  it('a from a gait sends StopMove and Pose on, then only Pose off', () => {
    const { sent, state } = run(at('Trotting', null), [pressA, pressA]);
    expect(sent).toEqual([sequence('Enter Pose', perform('StopMove'), enter('Pose')), leave('Pose')]);
    expect(state).toMatchObject({ gait: 'Trotting', posture: null, previousGait: 'FreeWalk' });
  });

  it('a out of Pose sends only Pose off when the gait is unknown', () => {
    expect(pressA(at(null, 'Pose'))).toEqual(leave('Pose'));
  });
});
