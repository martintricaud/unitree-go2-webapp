import { describe, it, expect } from 'vitest';
import { get, writable } from 'svelte/store';
import { presets } from '../data/cues';
import { enter, perform, sequence, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { createCueSheet } from './cueSheet';
import type { Outcome } from './outcomes';
import { createRobotState } from './robotState';

const CUES: [Cue, ...Cue[]] = [enter('FreeWalk'), perform('Hello'), wait(1)];

/** A cue sheet of its own, on a robot state whose client records each cue and never answers, so
 * every cue sent stays pending. */
const setup = () => {
  const sent: Cue[] = [];
  const robotState = createRobotState({
    client: {
      request: (_cue: Cue) => {
        sent.push(_cue);
        return { reqId: sent.length, verdict: new Promise<Outcome>(() => {}) };
      },
    },
    robotReport: writable({}),
    robotConnected: writable(true),
  });
  const cueSheet = createCueSheet(CUES, robotState);
  return { cueSheet, robotState, sent };
};

/** What one press of `_key` does from the first cue and the robot's boot state. */
const pressOnce = (_key: string) => {
  const { cueSheet, sent } = setup();
  cueSheet.press(_key);
  return { sent, pointer: get(cueSheet.pointer), pressed: get(cueSheet.pressed) };
};

const ENTER_POSE = sequence('Enter Pose', perform('StopMove'), enter('Pose'));

describe('cueSheet', () => {
  it('starts on the first cue, with no cue pressed', () => {
    const { cueSheet } = setup();
    expect(get(cueSheet.pointer)).toBe(0);
    expect(get(cueSheet.pressed)).toBeNull();
  });

  it('fires the cue under the pointer, draws it pressed, and moves the pointer by the step', () => {
    const { cueSheet, sent } = setup();
    cueSheet.fire(1);
    expect(sent).toEqual([CUES[0]]);
    expect(get(cueSheet.pressed)).toBe(0);
    expect(get(cueSheet.pointer)).toBe(1);

    cueSheet.fire(0);
    expect(sent).toEqual([CUES[0], CUES[1]]);
    expect(get(cueSheet.pressed)).toBe(1);
    expect(get(cueSheet.pointer)).toBe(1);
  });

  it('moves the pointer without sending', () => {
    const { cueSheet, sent } = setup();
    cueSheet.move(2);
    expect(get(cueSheet.pointer)).toBe(2);
    cueSheet.move(-1);
    expect(get(cueSheet.pointer)).toBe(1);
    expect(sent).toEqual([]);
    expect(get(cueSheet.pressed)).toBeNull();
  });

  it('keeps the pointer on the first and the last cue', () => {
    const { cueSheet } = setup();
    cueSheet.move(-1);
    expect(get(cueSheet.pointer)).toBe(0);
    cueSheet.fire(-1);
    expect(get(cueSheet.pointer)).toBe(0);
    cueSheet.move(10);
    expect(get(cueSheet.pointer)).toBe(CUES.length - 1);
    cueSheet.fire(1);
    expect(get(cueSheet.pointer)).toBe(CUES.length - 1);
  });

  it('clears the pressed cue on release', () => {
    const { cueSheet } = setup();
    cueSheet.fire(1);
    cueSheet.release();
    expect(get(cueSheet.pressed)).toBeNull();
    expect(get(cueSheet.pointer)).toBe(1);
  });

  it('sends the cue at an index, and keeps the pointer and the pressed cue', () => {
    const { cueSheet, sent } = setup();
    cueSheet.send(2);
    expect(sent).toEqual([CUES[2]]);
    expect(get(cueSheet.pointer)).toBe(0);
    expect(get(cueSheet.pressed)).toBeNull();
  });

  it.each([
    ['ArrowRight', { sent: [CUES[0]], pointer: 1, pressed: 0 }],
    ['ArrowLeft', { sent: [CUES[0]], pointer: 0, pressed: 0 }],
    ['Enter', { sent: [CUES[0]], pointer: 0, pressed: 0 }],
    ['ArrowDown', { sent: [], pointer: 1, pressed: null }],
    ['ArrowUp', { sent: [], pointer: 0, pressed: null }],
  ] as const)('runs %s on the cue sheet', (_key, _result) => {
    expect(pressOnce(_key)).toEqual(_result);
  });

  it.each([
    ['a', ENTER_POSE],
    ['b', enter('Leaping')],
    ['x', perform('Sit')],
    ['y', presets.dance],
  ] as const)('sends the cue of %s, and leaves the pointer', (_key, _cue) => {
    expect(pressOnce(_key)).toEqual({ sent: [_cue], pointer: 0, pressed: null });
  });

  it('does nothing on an unbound key', () => {
    expect(pressOnce('z')).toEqual({ sent: [], pointer: 0, pressed: null });
    expect(pressOnce('toString')).toEqual({ sent: [], pointer: 0, pressed: null });
  });

  it('runs the binding a key was rebound to', () => {
    const { cueSheet, sent } = setup();
    cueSheet.bindings.update((_bindings) => ({ ..._bindings, a: _bindings.y }));
    cueSheet.press('a');
    expect(sent).toEqual([presets.dance]);
  });

  it('sends nothing for a toggle whose fields wait for a verdict, and still sends a preset', () => {
    const { cueSheet, robotState, sent } = setup();
    cueSheet.press('a');
    expect(get(robotState).pending.posture).toBeDefined();
    // Pose, Sit and Leaping all toggle the posture, which waits.
    cueSheet.press('a');
    cueSheet.press('x');
    cueSheet.press('b');
    cueSheet.press('y');
    expect(sent).toEqual([ENTER_POSE, presets.dance]);
  });
});
