import { describe, it, expect } from 'vitest';
import { keys, pick, range } from 'remeda';
import { get, writable } from 'svelte/store';
import { presets } from '../data/cues';
import { enter, perform, sequence, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { createCueSheet } from './cueSheet';
import type { Outcome } from './outcomes';
import { createRobot } from './robot';

const CUES: [Cue, ...Cue[]] = [enter('FreeWalk'), perform('Hello'), wait(1)];

/** The label and steps of each cue, as the robot writes them to the relay. */
const asSent = (..._cues: Cue[]) => _cues.map((_cue) => ({ command_name: _cue.label, sequence: _cue.steps }));

/** A cue sheet of its own, on a fresh robot whose open socket the relay never answers, so every
 * cue sent stays pending. `sent` reads each cue the robot wrote, as `asSent` shows it. */
const setup = (_cues = CUES) => {
  const frames: string[] = [];
  const send = (_frame: string) => void frames.push(_frame);
  const socket = { readyState: 1, send, onopen: null, onclose: null, onmessage: null };
  const robot = createRobot({ openSocket: () => socket, outcomeLog: writable<Outcome[]>([]) });
  robot.connect();
  const cueSheet = createCueSheet(_cues, robot);
  const sent = () => frames.map((_frame) => pick(JSON.parse(_frame), ['command_name', 'sequence']));
  return { cueSheet, robot, sent };
};

/** What one press of `_key` does from the first cue and the robot's boot state. */
const pressOnce = (_key: string) => {
  const { cueSheet, sent } = setup();
  cueSheet.press(_key);
  return { sent: sent(), pointer: get(cueSheet.pointer), pressed: get(cueSheet.pressed) };
};

const ENTER_POSE = enter('Pose');

describe('cueSheet', () => {
  it('starts on the first cue, with no cue pressed', () => {
    const { cueSheet } = setup();
    expect(get(cueSheet.pointer)).toBe(0);
    expect(get(cueSheet.pressed)).toBeNull();
  });

  it('fires the cue under the pointer, draws it pressed, and moves the pointer by the step', () => {
    const { cueSheet, sent } = setup();
    cueSheet.fire(1);
    expect(sent()).toEqual(asSent(CUES[0]));
    expect(get(cueSheet.pressed)).toBe(0);
    expect(get(cueSheet.pointer)).toBe(1);

    cueSheet.fire(0);
    expect(sent()).toEqual(asSent(CUES[0], CUES[1]));
    expect(get(cueSheet.pressed)).toBe(1);
    expect(get(cueSheet.pointer)).toBe(1);
  });

  it('moves the pointer without sending', () => {
    const { cueSheet, sent } = setup();
    cueSheet.move(2);
    expect(get(cueSheet.pointer)).toBe(2);
    cueSheet.move(-1);
    expect(get(cueSheet.pointer)).toBe(1);
    expect(sent()).toEqual([]);
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

  it('clears the pressed cue on the release of a key that fires, and keeps it on any other', () => {
    const { cueSheet } = setup();
    cueSheet.press('ArrowRight');
    cueSheet.release('ArrowDown');
    cueSheet.release('a');
    cueSheet.release('z');
    expect(get(cueSheet.pressed)).toBe(0);
    cueSheet.release('ArrowRight');
    expect(get(cueSheet.pressed)).toBeNull();
    expect(get(cueSheet.pointer)).toBe(1);
  });

  it('sends the cue at an index, and keeps the pointer and the pressed cue', () => {
    const { cueSheet, sent } = setup();
    cueSheet.send(2);
    expect(sent()).toEqual(asSent(CUES[2]));
    expect(get(cueSheet.pointer)).toBe(0);
    expect(get(cueSheet.pressed)).toBeNull();
  });

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
    cueSheet.bindings.update((_bindings) => ({ ..._bindings, a: _bindings.y }));
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
});

const SABOTS = sequence('Sabots', enter('FreeWalk'), wait(0.1), enter('Backstand'));
const BYE = sequence('Bye', perform('Content'), wait(0.5));
/** A sheet whose cells 2 and 5 have constituents. */
const SHEET: [Cue, ...Cue[]] = [enter('FreeWalk'), enter('Pose'), SABOTS, perform('Hello'), wait(1), BYE];

type CueSheet = ReturnType<typeof setup>['cueSheet'];

/** Runs the transition `_name` that the strip of `_cueSheet` offers in its current mode, and throws
 * when that mode does not offer it. */
const transition = (_cueSheet: CueSheet, _name: string) => {
  const run = new Map(Object.entries(get(_cueSheet.strip).transitions)).get(_name);
  if (run === undefined) throw new Error(`The strip offers no ${_name} in this mode.`);
  run();
};

/** A sheet of `SHEET` with its pointer moved to `_pointer` in play mode, then switched to edit mode.
 * `shown` reads what the strip shows, with the active tool in place of the tools. */
const editing = (_pointer = 0) => {
  const { cueSheet, robot, sent } = setup(SHEET);
  const shown = () => {
    const { cells, pointer, pressed, selection, renaming, cursor, draggable, tools } = get(cueSheet.strip);
    return { cells, pointer, pressed, selection, renaming, cursor, draggable, tool: tools?.active ?? null };
  };
  cueSheet.move(_pointer);
  transition(cueSheet, 'Edit');
  return { cueSheet, robot, sent, shown };
};

/** Calls every edit method once, with indices inside the sheet. */
const editAll = (_cueSheet: CueSheet) => {
  _cueSheet.rename(0, 'X');
  _cueSheet.split(2);
  _cueSheet.merge(3, 4);
  _cueSheet.reorder(0, 1);
  _cueSheet.select(1);
  _cueSheet.extend(3);
  _cueSheet.stopRenaming();
};

describe('cueSheet in edit mode', () => {
  it('shows the saved sheet in play mode, and a draft of it with the Select tool after Edit', () => {
    const { cueSheet, sent } = setup(SHEET);
    const play = get(cueSheet.strip);
    expect(pick(play, ['cells', 'pointer', 'pressed', 'selection', 'renaming', 'cursor', 'draggable'])).toEqual({
      cells: SHEET,
      pointer: 0,
      pressed: null,
      selection: [],
      renaming: null,
      cursor: 'default',
      draggable: false,
    });
    expect([play.tools, play.actions, keys(play.transitions)]).toEqual([null, null, ['Edit']]);
    play.click(3, false);
    expect(sent()).toEqual(asSent(SHEET[3]));

    const { cueSheet: edited, shown } = editing(2);
    expect(shown()).toEqual({
      cells: SHEET,
      pointer: 2,
      pressed: null,
      selection: [],
      renaming: null,
      cursor: 'default',
      draggable: true,
      tool: 'Select',
    });
    expect(keys(get(edited.strip).transitions)).toEqual(['Save', 'Reset', 'Cancel']);
  });

  it('saves a renamed cell with its steps, changes and items, and sends it under its new label', () => {
    const { cueSheet, sent } = editing();
    cueSheet.rename(1, 'X');
    transition(cueSheet, 'Save');
    const renamed = { ...SHEET[1], label: 'X' };
    expect(get(cueSheet.strip).cells).toEqual([SHEET[0], renamed, ...SHEET.slice(2)]);
    expect(get(cueSheet.strip).tools).toBeNull();
    get(cueSheet.strip).click(1, false);
    expect(sent()).toEqual(asSent(renamed));
  });

  it('saves the draft pointer, clears the pressed cell, and clamps the pointer to the saved length', () => {
    const { cueSheet } = setup(SHEET);
    cueSheet.press('ArrowRight');
    cueSheet.move(3);
    transition(cueSheet, 'Edit');
    cueSheet.merge(1, 3);
    transition(cueSheet, 'Save');
    expect([get(cueSheet.pointer), get(cueSheet.pressed)]).toEqual([2, null]);
    cueSheet.move(10);
    expect(get(cueSheet.pointer)).toBe(SHEET.length - 3);
  });

  it('keeps the saved sheet and the pointer after edits and Cancel', () => {
    const { cueSheet, shown } = editing(2);
    editAll(cueSheet);
    transition(cueSheet, 'Cancel');
    expect(get(cueSheet.strip).tools).toBeNull();
    expect([get(cueSheet.strip).cells, get(cueSheet.pointer)]).toEqual([SHEET, 2]);
    expect(shown().pointer).toBe(2);
  });

  it('starts a new draft of the saved sheet after edits and Reset, and stays in edit mode', () => {
    const { cueSheet, shown } = editing(2);
    const before = shown();
    editAll(cueSheet);
    get(cueSheet.strip).tools?.Rename();
    transition(cueSheet, 'Reset');
    expect(shown()).toEqual(before);
    expect(shown()).toMatchObject({ cells: SHEET, selection: [], tool: 'Select' });
  });

  it('splits a sequence into its items, in order, and leaves a cell without constituents', () => {
    const { cueSheet, shown } = editing();
    cueSheet.split(2);
    expect(shown().cells).toEqual([SHEET[0], SHEET[1], ...SABOTS.items, ...SHEET.slice(3)]);
    const before = shown();
    cueSheet.split(0);
    expect(shown()).toEqual(before);
  });

  it('merges the cells between two indices in either order into one sequence', () => {
    const merged = (_from: number, _to: number) => {
      const { cueSheet, shown } = editing();
      cueSheet.merge(_from, _to);
      return shown().cells;
    };
    const expected = [SHEET[0], sequence('Pose → Hello', SHEET[1], SHEET[2], SHEET[3]), ...SHEET.slice(4)];
    expect(merged(1, 3)).toEqual(expected);
    expect(merged(3, 1)).toEqual(expected);
  });

  it('restores the draft by splitting what a merge made', () => {
    const { cueSheet, shown } = editing();
    cueSheet.select(1);
    cueSheet.extend(3);
    const before = shown();
    cueSheet.merge(1, 3);
    cueSheet.split(1);
    expect(shown()).toEqual(before);
  });

  it.each([
    [1, 4, [0, 2, 3, 4, 1, 5]],
    [4, 1, [0, 4, 1, 2, 3, 5]],
  ])('moves only cell %i to position %i', (_from, _to, _order) => {
    const { cueSheet, shown } = editing();
    cueSheet.reorder(_from, _to);
    expect(shown().cells).toEqual(_order.map((_index) => SHEET[_index]));
  });

  it.each([
    ['merge(2, 2)', (_s: CueSheet) => _s.merge(2, 2)],
    ['rename(-1)', (_s: CueSheet) => _s.rename(-1, 'X')],
    ['rename(6)', (_s: CueSheet) => _s.rename(6, 'X')],
    ['split(6)', (_s: CueSheet) => _s.split(6)],
    ['split(1.5)', (_s: CueSheet) => _s.split(1.5)],
    ['merge(0, 6)', (_s: CueSheet) => _s.merge(0, 6)],
    ['merge(-1, 2)', (_s: CueSheet) => _s.merge(-1, 2)],
    ['reorder(0, 6)', (_s: CueSheet) => _s.reorder(0, 6)],
    ['reorder(6, 0)', (_s: CueSheet) => _s.reorder(6, 0)],
    ['select(6)', (_s: CueSheet) => _s.select(6)],
    ['extend(-1)', (_s: CueSheet) => _s.extend(-1)],
  ])('leaves the draft as it is on %s', (_name, _edit) => {
    const { cueSheet, shown } = editing(3);
    cueSheet.select(1);
    const before = shown();
    _edit(cueSheet);
    expect(shown()).toEqual(before);
  });

  it('does nothing on any edit in play mode', () => {
    const { cueSheet } = setup(SHEET);
    const data = () => pick(get(cueSheet.strip), ['cells', 'pointer', 'pressed', 'selection', 'renaming', 'tools']);
    const before = data();
    editAll(cueSheet);
    expect(data()).toEqual(before);
    expect(before.tools).toBeNull();
  });

  it('selects a cell, extends the selection from its first cell, and extends an empty one to one cell', () => {
    const { cueSheet, shown } = editing();
    cueSheet.select(2);
    cueSheet.extend(4);
    expect(shown().selection).toEqual([2, 3, 4]);
    cueSheet.extend(0);
    expect(shown().selection).toHaveLength(5);
    expect(shown().selection).toEqual(expect.arrayContaining(range(0, 5)));

    const { cueSheet: empty, shown: shownEmpty } = editing();
    empty.extend(3);
    expect(shownEmpty().selection).toEqual([3]);
  });

  it('selects on a click and extends on a shift-click with the Select tool, and sends nothing', () => {
    const { cueSheet, sent, shown } = editing();
    get(cueSheet.strip).click(2, false);
    get(cueSheet.strip).click(4, true);
    expect(shown().selection).toEqual([2, 3, 4]);
    expect(sent()).toEqual([]);
  });

  it('renames on a click with the Rename tool, and keeps the selection and the tool', () => {
    const { cueSheet, sent, shown } = editing();
    cueSheet.select(1);
    get(cueSheet.strip).tools?.Rename();
    expect(shown()).toMatchObject({ cursor: 'text', tool: 'Rename' });
    get(cueSheet.strip).click(2, false);
    expect(shown()).toMatchObject({ renaming: 2, selection: [1] });
    cueSheet.stopRenaming();
    expect(shown()).toMatchObject({ renaming: null, selection: [1] });
    expect(shown().cells[2].label).toBe('Sabots');
    get(cueSheet.strip).click(2, false);
    cueSheet.rename(2, 'ay b');
    expect(shown()).toMatchObject({ renaming: null, tool: 'Rename' });
    expect(shown().cells[2].label).toBe('ay b');
    get(cueSheet.strip).tools?.Select();
    expect(shown()).toMatchObject({ cursor: 'default', tool: 'Select' });
    expect(sent()).toEqual([]);
  });

  it.each([
    [[], false, false],
    [[1], false, false],
    [[2], false, true],
    [[1, 2], true, true],
    [[2, 3, 4], true, true],
    [[2, 3, 4, 5], true, false],
  ])('offers Group and Ungroup on the selection %j: %s, %s', (_selection, _group, _ungroup) => {
    const { cueSheet } = editing();
    _selection.forEach(cueSheet.extend);
    expect(get(cueSheet.strip).actions?.group !== null).toBe(_group);
    expect(get(cueSheet.strip).actions?.ungroup !== null).toBe(_ungroup);
  });

  it('groups the selection from its lowest to its highest cell, and ungroups its one sequence', () => {
    const grouped = editing();
    const merged = editing();
    grouped.cueSheet.select(3);
    grouped.cueSheet.extend(1);
    get(grouped.cueSheet.strip).actions?.group?.();
    merged.cueSheet.merge(1, 3);
    expect(grouped.shown()).toEqual(merged.shown());

    const ungrouped = editing();
    const split = editing();
    ungrouped.cueSheet.select(1);
    ungrouped.cueSheet.extend(2);
    get(ungrouped.cueSheet.strip).actions?.ungroup?.();
    split.cueSheet.split(2);
    expect(ungrouped.shown()).toEqual(split.shown());
  });

  describe('moves the pointer and the selection', () => {
    it.each([
      [3, 3],
      [0, 0],
    ])('keeps both on rename, with the pointer at %i', (_pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      cueSheet.select(4);
      cueSheet.rename(1, 'X');
      expect([shown().pointer, shown().selection]).toEqual([_after, [4]]);
    });

    it.each([
      ['before the cell', 1, 1],
      ['on the cell', 2, 2],
      ['after the cell', 4, 6],
    ])('on split(2) into 3 cells, with the pointer %s', (_where, _pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      cueSheet.split(2);
      expect([shown().pointer, shown().selection]).toEqual([_after, [2, 3, 4]]);
    });

    it.each([
      ['before lo', 0, 0],
      ['on lo', 1, 1],
      ['inside', 2, 1],
      ['on hi', 3, 1],
      ['after hi', 5, 3],
    ])('on merge(1, 3), with the pointer %s', (_where, _pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      cueSheet.merge(1, 3);
      expect([shown().pointer, shown().selection]).toEqual([_after, [1]]);
    });

    it.each([
      [1, 4, 'on from', 1, 4],
      [1, 4, 'between', 3, 2],
      [1, 4, 'on to', 4, 3],
      [1, 4, 'before', 0, 0],
      [1, 4, 'after', 5, 5],
      [4, 1, 'on from', 4, 1],
      [4, 1, 'between', 2, 3],
      [4, 1, 'on to', 1, 2],
      [4, 1, 'before', 0, 0],
      [4, 1, 'after', 5, 5],
    ])('on reorder(%i, %i), with the pointer %s', (_from, _to, _where, _pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      cueSheet.reorder(_from, _to);
      expect([shown().pointer, shown().selection]).toEqual([_after, [_to]]);
    });
  });

  it.each(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Enter'])(
    'sends nothing and keeps the pointer on %s',
    (_key) => {
      const { cueSheet, sent, shown } = editing(1);
      cueSheet.press(_key);
      cueSheet.release(_key);
      expect([sent(), get(cueSheet.pointer), shown().pointer, get(cueSheet.pressed)]).toEqual([[], 1, 1, null]);
    },
  );

  it('still toggles Pose on a', () => {
    const { cueSheet, sent } = editing(1);
    cueSheet.press('a');
    expect(sent()).toEqual(asSent(ENTER_POSE));
  });
});
