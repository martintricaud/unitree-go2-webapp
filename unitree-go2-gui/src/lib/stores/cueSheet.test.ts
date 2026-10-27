import { describe, it, expect } from 'vitest';
import { map, pick, set, times } from 'remeda';
import { get } from 'svelte/store';
import { CONDUITE, presets } from '../data/cues';
import { enter, perform, sequence, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { CueSheet } from './cueSheet.svelte';
import { OutcomeLog } from './outcomes.svelte';
import { createRobot } from './robot';

const CUES: [Cue, ...Cue[]] = [enter('FreeWalk'), perform('Hello'), wait(1)];

/** The label and steps of each cue, as the robot writes them to the relay. */
const asSent = (..._cues: Cue[]) => map(_cues, (_cue) => ({ command_name: _cue.label, sequence: _cue.steps }));

/** A storage that keeps its entries in `entries`, as `localStorage` keeps them across reloads. */
const memoryStorage = (_entries = new Map<string, string>()) => ({
  entries: _entries,
  getItem: (_key: string) => _entries.get(_key) ?? null,
  setItem: (_key: string, _value: string) => void _entries.set(_key, _value),
});

/** A cue sheet of its own on `_storage`, on a fresh robot whose open socket the relay never answers,
 * so every cue sent stays pending. `sent` reads each cue the robot wrote, as `asSent` shows it. */
const setup = (_cues = CUES, _storage: Pick<Storage, 'getItem' | 'setItem'> = memoryStorage()) => {
  const frames: string[] = [];
  const send = (_frame: string) => void frames.push(_frame);
  const socket = { readyState: 1, send, onopen: null, onclose: null, onmessage: null };
  const robot = createRobot({ openSocket: () => socket, outcomeLog: new OutcomeLog() });
  robot.connect();
  const cueSheet = new CueSheet(_cues, robot, _storage);
  const sent = () => map(frames, (_frame) => pick(JSON.parse(_frame), ['command_name', 'sequence']));
  return { cueSheet, robot, sent };
};

/** The pointer and the pressed cell of `_cueSheet`, read through the store contract. */
const position = (_cueSheet: CueSheet) => pick(get(_cueSheet), ['pointer', 'pressed']);

/** Presses and releases `_key` on `_cueSheet`, `_count` times. */
const tap = (_cueSheet: CueSheet, _key: string, _count = 1) =>
  times(_count, () => {
    _cueSheet.press(_key);
    _cueSheet.release(_key);
  });

/** What one press of `_key` does from the first cue and the robot's boot state. */
const pressOnce = (_key: string) => {
  const { cueSheet, sent } = setup();
  cueSheet.press(_key);
  return { sent: sent(), ...position(cueSheet) };
};

const ENTER_POSE = enter('Pose');

describe('cueSheet in play mode', () => {
  it('starts on the first cue under Fire, with no cue pressed and the saved cells shown', () => {
    const { cueSheet } = setup();
    expect(get(cueSheet)).toEqual({ saved: CUES, cells: CUES, pointer: 0, pressed: null, instrument: 'Fire', renaming: null });
  });

  it('fires the cue under the pointer, draws it pressed, and moves the pointer by the step', () => {
    const { cueSheet, sent } = setup();
    cueSheet.press('ArrowRight');
    expect(sent()).toEqual(asSent(CUES[0]));
    expect(position(cueSheet)).toEqual({ pointer: 1, pressed: 0 });
    cueSheet.press('Enter');
    expect(sent()).toEqual(asSent(CUES[0], CUES[1]));
    expect(position(cueSheet)).toEqual({ pointer: 1, pressed: 1 });
  });

  it('moves the pointer without sending, and keeps it on the first and the last cue', () => {
    const { cueSheet, sent } = setup();
    tap(cueSheet, 'ArrowDown', 2);
    tap(cueSheet, 'ArrowUp');
    expect(position(cueSheet)).toEqual({ pointer: 1, pressed: null });
    expect(sent()).toEqual([]);
    tap(cueSheet, 'ArrowUp', 2);
    tap(cueSheet, 'ArrowLeft');
    expect(position(cueSheet).pointer).toBe(0);
    tap(cueSheet, 'ArrowDown', 10);
    tap(cueSheet, 'ArrowRight');
    expect(position(cueSheet).pointer).toBe(CUES.length - 1);
  });

  it('clears the pressed cue on the release of a key that fires, and keeps it on any other', () => {
    const { cueSheet } = setup();
    cueSheet.press('ArrowRight');
    cueSheet.release('ArrowDown');
    cueSheet.release('a');
    cueSheet.release('z');
    expect(position(cueSheet).pressed).toBe(0);
    cueSheet.release('ArrowRight');
    expect(position(cueSheet)).toEqual({ pointer: 1, pressed: null });
  });

  it('sends the cue of the cell a Fire sweep ends on, and keeps the pointer and the pressed cue', () => {
    const { cueSheet, sent } = setup();
    cueSheet.sweep(0, 2);
    expect(sent()).toEqual(asSent(CUES[2]));
    expect(position(cueSheet)).toEqual({ pointer: 0, pressed: null });
  });
});

describe('cueSheet keys', () => {
  it.each([
    ['ArrowRight', { sent: asSent(CUES[0]), pointer: 1, pressed: 0 }],
    ['ArrowLeft', { sent: asSent(CUES[0]), pointer: 0, pressed: 0 }],
    ['Enter', { sent: asSent(CUES[0]), pointer: 0, pressed: 0 }],
    ['ArrowDown', { sent: [], pointer: 1, pressed: null }],
    ['ArrowUp', { sent: [], pointer: 0, pressed: null }],
  ] as const)('runs %s on the cue sheet', (_key, _result) => {
    expect(pressOnce(_key)).toEqual(_result);
  });

  it.each([
    ['a', ENTER_POSE],
    ['b', enter('Leaping')],
    ['x', enter('Sitting')],
    ['y', presets.dance],
  ] as const)('sends the cue of %s, and leaves the pointer', (_key, _cue) => {
    expect(pressOnce(_key)).toEqual({ sent: asSent(_cue), pointer: 0, pressed: null });
  });

  it('does nothing on an unbound key', () => {
    expect(pressOnce('z')).toEqual({ sent: [], pointer: 0, pressed: null });
    expect(pressOnce('toString')).toEqual({ sent: [], pointer: 0, pressed: null });
  });

  it('runs the binding a key was rebound to', () => {
    const { cueSheet, sent } = setup();
    cueSheet.bindings = set(cueSheet.bindings, 'a', cueSheet.bindings.y);
    cueSheet.press('a');
    expect(sent()).toEqual(asSent(presets.dance));
  });

  it('sends nothing for a toggle whose fields wait for a verdict, and still sends a preset', () => {
    const { cueSheet, robot, sent } = setup();
    cueSheet.press('a');
    expect(get(robot).state.pending.posture).toBeDefined();
    // Pose, Sit and Leaping all toggle the posture, which waits.
    cueSheet.press('a');
    cueSheet.press('x');
    cueSheet.press('b');
    cueSheet.press('y');
    expect(sent()).toEqual(asSent(ENTER_POSE, presets.dance));
  });

  it.each(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter'])(
    'sends nothing and keeps the pointer on %s while editing',
    (_key) => {
      const { cueSheet, sent } = setup();
      tap(cueSheet, 'ArrowDown');
      cueSheet.choose('Move');
      tap(cueSheet, _key);
      expect([sent(), position(cueSheet)]).toEqual([[], { pointer: 1, pressed: null }]);
    },
  );

  it('still toggles Pose on a while editing', () => {
    const { cueSheet, sent } = setup();
    cueSheet.choose('Group');
    cueSheet.press('a');
    expect(sent()).toEqual(asSent(ENTER_POSE));
  });
});

describe('cueSheet as a store', () => {
  it('applies a detached update, and shows the change through get', () => {
    const { cueSheet } = setup();
    const { update } = cueSheet;
    update((_state) => ({ ..._state, pointer: 2 }));
    expect(position(cueSheet).pointer).toBe(2);
  });
});

/** `choose` takes only an instrument: the type checker proves it on this line, which no test runs. */
// @ts-expect-error: 'Erase' is not an instrument.
void ((_cueSheet: CueSheet) => _cueSheet.choose('Erase'));

const SABOTS = sequence('Sabots', enter('FreeWalk'), wait(0.1), enter('Backstand'));
const BYE = sequence('Bye', perform('Content'), wait(0.5));
/** A sheet whose cells 2 and 5 have constituents. */
const SHEET: [Cue, ...Cue[]] = [enter('FreeWalk'), enter('Pose'), SABOTS, perform('Hello'), wait(1), BYE];

/** A sheet of `_cues` on `_storage` with its pointer moved to `_pointer` in play mode, then edited
 * under `_instrument`. */
const editing = (
  _instrument: CueSheet['state']['instrument'],
  _pointer = 0,
  _cues = SHEET,
  _storage: Pick<Storage, 'getItem' | 'setItem'> = memoryStorage(),
) => {
  const { cueSheet, sent } = setup(_cues, _storage);
  tap(cueSheet, 'ArrowDown', _pointer);
  cueSheet.choose(_instrument);
  return { cueSheet, sent, shown: () => get(cueSheet) };
};

describe('cueSheet sweeps', () => {
  it('moves cell 0 of CONDUITE to position 2, and keeps the pointer on its cell', () => {
    const { cueSheet, shown } = editing('Move', 1, CONDUITE);
    cueSheet.sweep(0, 2);
    expect(map(shown().cells.slice(0, 3), (_cell) => _cell.label)).toEqual(['Pose', 'Sabots', 'FreeWalk']);
    expect(shown().cells[shown().pointer]).toBe(CONDUITE[1]);
  });

  it.each([
    [1, 4],
    [4, 1],
  ])('moves only cell %i to position %i, and keeps the pointer on its cell wherever it is', (_from, _to) => {
    times(SHEET.length, (_pointer) => {
      const { cueSheet, shown } = editing('Move', _pointer);
      cueSheet.sweep(_from, _to);
      expect(shown().cells[_to]).toBe(SHEET[_from]);
      expect(shown().cells[shown().pointer]).toBe(SHEET[_pointer]);
    });
    const { cueSheet, shown } = editing('Move');
    cueSheet.sweep(_from, _to);
    expect(shown().cells).toEqual(map(_from < _to ? [0, 2, 3, 4, 1, 5] : [0, 4, 1, 2, 3, 5], (_index) => SHEET[_index]));
  });

  it('groups the cells of a sweep made in either direction into one sequence, and leaves a sweep of one cell', () => {
    const grouped = [SHEET[0], sequence('Pose → Hello', SHEET[1], SHEET[2], SHEET[3]), ...SHEET.slice(4)];
    times(2, (_reverse) => {
      const { cueSheet, shown } = editing('Group');
      cueSheet.sweep(_reverse ? 3 : 1, _reverse ? 1 : 3);
      expect(shown().cells).toEqual(grouped);
    });
    const { cueSheet, shown } = editing('Group');
    const before = shown();
    cueSheet.sweep(2, 2);
    expect(shown()).toEqual(before);
  });

  it.each([
    ['before lo', 0, 0],
    ['on lo', 1, 1],
    ['inside', 2, 1],
    ['on hi', 3, 1],
    ['after hi', 5, 3],
  ])('moves the pointer %s of a Group of cells 1 to 3', (_where, _pointer, _after) => {
    const { cueSheet, shown } = editing('Group', _pointer);
    cueSheet.sweep(3, 1);
    expect(shown().pointer).toBe(_after);
  });

  it('replaces both groups of a swept range by their constituents, and keeps its plain cell', () => {
    const cues: [Cue, ...Cue[]] = [enter('FreeWalk'), SABOTS, perform('Hello'), BYE, wait(1)];
    const { cueSheet, shown } = editing('Ungroup', 0, cues);
    cueSheet.sweep(3, 1);
    expect(shown().cells).toEqual([cues[0], ...SABOTS.items, cues[2], ...BYE.items, cues[4]]);
  });

  it.each([
    ['before the cell', 1, 1],
    ['on the cell', 2, 2],
    ['after the cell', 4, 6],
  ])('moves the pointer %s on an Ungroup of cell 2 into 3 cells', (_where, _pointer, _after) => {
    const { cueSheet, shown } = editing('Ungroup', _pointer);
    cueSheet.sweep(2, 2);
    expect(shown().pointer).toBe(_after);
  });

  it('starts renaming the cell a Rename sweep ends on, and sends nothing', () => {
    const { cueSheet, sent, shown } = editing('Rename');
    cueSheet.sweep(0, 2);
    expect(shown()).toMatchObject({ cells: SHEET, renaming: 2, instrument: 'Rename' });
    expect(sent()).toEqual([]);
  });
});

describe('cueSheet sweeps in progress', () => {
  it('previews a Move as its release will leave the cells, and highlights only the moved cell', () => {
    const { cueSheet, shown } = editing('Move');
    const preview = cueSheet.instruments.Move.shown(1, 4)(shown().cells);
    expect(cueSheet.instruments.Move.swept(1, 4)).toEqual([4]);
    cueSheet.sweep(1, 4);
    expect(preview).toEqual(shown().cells);
  });

  it('highlights nothing under Fire, and shows the cells unchanged', () => {
    const { cueSheet, shown } = editing('Fire');
    expect(cueSheet.instruments.Fire.swept(1, 4)).toEqual([]);
    expect(cueSheet.instruments.Fire.shown(1, 4)(shown().cells)).toEqual(shown().cells);
  });

  it.each(['Rename', 'Group', 'Ungroup'] as const)('highlights the swept range in either direction under %s', (_name) => {
    const { cueSheet, shown } = editing(_name);
    expect(cueSheet.instruments[_name].swept(3, 1)).toEqual([1, 2, 3]);
    expect(cueSheet.instruments[_name].shown(3, 1)(shown().cells)).toEqual(shown().cells);
  });
});

describe('cueSheet edits', () => {
  it('renames a cell and ends the rename, keeps the label on stopRenaming, and ends a rename on another change', () => {
    const { cueSheet, shown } = editing('Rename');
    cueSheet.sweep(2, 2);
    cueSheet.stopRenaming();
    expect(shown()).toMatchObject({ renaming: null, instrument: 'Rename' });
    expect(shown().cells[2].label).toBe('Sabots');
    cueSheet.sweep(2, 2);
    cueSheet.rename(2, 'ay b');
    expect(shown()).toMatchObject({ renaming: null, instrument: 'Rename' });
    expect(shown().cells[2]).toEqual({ ...SABOTS, label: 'ay b' });
    cueSheet.sweep(3, 3);
    cueSheet.reorder(1, 3);
    expect(shown().renaming).toBeNull();
    cueSheet.sweep(3, 3);
    cueSheet.choose('Move');
    expect(shown().renaming).toBeNull();
  });

  it('saves the shown cells, clears the pressed cell, returns to Fire, and sends a renamed cell under its new label', () => {
    const { cueSheet, sent } = setup(SHEET);
    const shown = () => get(cueSheet);
    cueSheet.press('ArrowRight');
    cueSheet.choose('Rename');
    cueSheet.rename(1, 'X');
    cueSheet.save();
    const renamed = { ...SHEET[1], label: 'X' };
    const cells = [SHEET[0], renamed, ...SHEET.slice(2)];
    expect(shown()).toEqual({ saved: cells, cells, pointer: 1, pressed: null, instrument: 'Fire', renaming: null });
    cueSheet.sweep(1, 1);
    expect(sent()).toEqual(asSent(SHEET[0], renamed));
  });

  it('restores the saved cells on Cancel, returns to Fire, and keeps the pointer index, clamped to the saved length', () => {
    const { cueSheet, shown } = editing('Group', 4);
    cueSheet.sweep(0, 3);
    expect(shown().pointer).toBe(1);
    cueSheet.cancel();
    expect(shown()).toEqual({ saved: SHEET, cells: SHEET, pointer: 1, pressed: null, instrument: 'Fire', renaming: null });

    const { cueSheet: grown, shown: grownShown } = editing('Ungroup', 5);
    grown.sweep(2, 2);
    expect(grownShown().pointer).toBe(7);
    grown.cancel();
    expect(grownShown()).toMatchObject({ cells: SHEET, pointer: SHEET.length - 1, instrument: 'Fire' });
  });

  it('shows the saved cells again on Reset, keeps the instrument, and ends any rename', () => {
    const { cueSheet, shown } = editing('Ungroup', 5);
    cueSheet.sweep(2, 2);
    cueSheet.choose('Rename');
    cueSheet.sweep(1, 1);
    cueSheet.reset();
    expect(shown()).toEqual({ saved: SHEET, cells: SHEET, pointer: SHEET.length - 1, pressed: null, instrument: 'Rename', renaming: null });
  });
});

describe('cueSheet in storage', () => {
  it('starts a second sheet on the same storage with the sheet the first one saved', () => {
    const storage = memoryStorage();
    const { cueSheet } = editing('Group', 0, SHEET, storage);
    cueSheet.sweep(3, 4);
    cueSheet.save();
    expect(storage.entries.has('cueSheet.v1')).toBe(true);
    const { cueSheet: reloaded } = setup(SHEET, storage);
    expect(get(reloaded).cells).toEqual(get(cueSheet).cells);
    expect(get(reloaded).cells).not.toEqual(SHEET);
  });

  it.each([
    ['Cancel', (_cueSheet: CueSheet) => _cueSheet.cancel()],
    ['Reset', (_cueSheet: CueSheet) => _cueSheet.reset()],
  ])('leaves the storage as it is after edits and %s', (_name, _end) => {
    const storage = memoryStorage();
    const { cueSheet } = editing('Rename', 0, SHEET, storage);
    cueSheet.rename(0, 'Saved');
    cueSheet.save();
    const before = [...storage.entries];
    cueSheet.choose('Group');
    cueSheet.sweep(1, 3);
    _end(cueSheet);
    expect([...storage.entries]).toEqual(before);
  });

  it.each([
    'not json',
    '[]',
    '[{"label":1}]',
    '{"label":"A","steps":[],"changes":[],"items":[]}',
    '[{"label":"A","steps":[],"changes":[],"items":[{"label":"B","steps":[],"changes":[]}]}]',
  ])('starts from the given cues when the storage holds %s', (_stored) => {
    const { cueSheet } = setup(SHEET, memoryStorage(new Map([['cueSheet.v1', _stored]])));
    expect(get(cueSheet).cells).toEqual(SHEET);
  });

  it('works in memory on a storage that throws on every access', () => {
    const refuse = () => {
      throw new Error('Storage is forbidden.');
    };
    const { cueSheet } = editing('Rename', 0, SHEET, { getItem: refuse, setItem: refuse });
    expect(get(cueSheet).cells).toEqual(SHEET);
    expect(() => {
      cueSheet.rename(1, 'X');
      cueSheet.save();
    }).not.toThrow();
    expect(get(cueSheet).cells).toEqual([SHEET[0], { ...SHEET[1], label: 'X' }, ...SHEET.slice(2)]);
  });
});
