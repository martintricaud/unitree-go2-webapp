import { describe, it, expect } from 'vitest';
import { keys, pick, range, times } from 'remeda';
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
  const robot = createRobot({ openSocket: () => socket, outcomeLog: writable<Outcome[]>([]) });
  robot.connect();
  const cueSheet = createCueSheet(_cues, robot, _storage);
  const sent = () => frames.map((_frame) => pick(JSON.parse(_frame), ['command_name', 'sequence']));
  return { cueSheet, robot, sent };
};

type CueSheet = ReturnType<typeof setup>['cueSheet'];

/** The pointer and the pressed cell the strip of `_cueSheet` shows. */
const position = (_cueSheet: CueSheet) => pick(get(_cueSheet.strip), ['pointer', 'pressed']);

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

describe('cueSheet', () => {
  it('starts on the first cue, with no cue pressed', () => {
    const { cueSheet } = setup();
    expect(position(cueSheet)).toEqual({ pointer: 0, pressed: null });
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

  it('moves the pointer without sending', () => {
    const { cueSheet, sent } = setup();
    tap(cueSheet, 'ArrowDown', 2);
    expect(position(cueSheet).pointer).toBe(2);
    tap(cueSheet, 'ArrowUp');
    expect(position(cueSheet)).toEqual({ pointer: 1, pressed: null });
    expect(sent()).toEqual([]);
  });

  it('keeps the pointer on the first and the last cue', () => {
    const { cueSheet } = setup();
    tap(cueSheet, 'ArrowUp');
    expect(position(cueSheet).pointer).toBe(0);
    tap(cueSheet, 'ArrowLeft');
    expect(position(cueSheet).pointer).toBe(0);
    tap(cueSheet, 'ArrowDown', 10);
    expect(position(cueSheet).pointer).toBe(CUES.length - 1);
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

  it('sends the cue of a clicked cell, and keeps the pointer and the pressed cue', () => {
    const { cueSheet, sent } = setup();
    get(cueSheet.strip).click(2, false);
    expect(sent()).toEqual(asSent(CUES[2]));
    expect(position(cueSheet)).toEqual({ pointer: 0, pressed: null });
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
/** A sheet whose cells 1 and 3 have constituents, with one cell before, between and after them. */
const TWO_GROUPS: [Cue, ...Cue[]] = [enter('FreeWalk'), SABOTS, perform('Hello'), BYE, wait(1)];

/** Runs the transition `_name` that the strip of `_cueSheet` offers in its current mode, and throws
 * when that mode does not offer it. */
const transition = (_cueSheet: CueSheet, _name: string) => {
  const run = new Map(Object.entries(get(_cueSheet.strip).transitions)).get(_name);
  if (run === undefined) throw new Error(`The strip offers no ${_name} in this mode.`);
  run();
};

/** Clicks cell `_index` of the strip of `_cueSheet`, with the shift key held when `_shift` is true. */
const click = (_cueSheet: CueSheet, _index: number, _shift = false) => get(_cueSheet.strip).click(_index, _shift);

/** Selects cells `_from` to `_to` with the Select tool: a click on `_from`, then a shift-click on `_to`. */
const select = (_cueSheet: CueSheet, _from: number, _to = _from) => {
  click(_cueSheet, _from);
  click(_cueSheet, _to, true);
};

/** Runs the action `_name` of the strip of `_cueSheet`; does nothing when the strip does not offer it. */
const act = (_cueSheet: CueSheet, _name: 'group' | 'ungroup') => get(_cueSheet.strip).actions?.[_name]?.();

/** A sheet of `_cues` on `_storage` with its pointer moved to `_pointer` in play mode, then switched
 * to edit mode. `shown` reads what the strip shows, with the active tool in place of the tools. */
const editing = (_pointer = 0, _storage = memoryStorage(), _cues = SHEET) => {
  const { cueSheet, robot, sent } = setup(_cues, _storage);
  const shown = () => {
    const { cells, pointer, pressed, selection, renaming, cursor, draggable, tools } = get(cueSheet.strip);
    return { cells, pointer, pressed, selection, renaming, cursor, draggable, tool: tools?.active ?? null };
  };
  tap(cueSheet, 'ArrowDown', _pointer);
  transition(cueSheet, 'Edit');
  return { cueSheet, robot, sent, shown };
};

/** Calls every edit method the cue sheet exports, with indices inside the sheet. */
const editMethods = (_cueSheet: CueSheet) => {
  _cueSheet.rename(0, 'X');
  _cueSheet.reorder(0, 1);
  _cueSheet.stopRenaming();
};

/** Makes every kind of edit once, with indices inside the sheet: the edit methods, a selection,
 * Ungroup and Group. */
const editAll = (_cueSheet: CueSheet) => {
  editMethods(_cueSheet);
  select(_cueSheet, 2);
  act(_cueSheet, 'ungroup');
  select(_cueSheet, 3, 4);
  act(_cueSheet, 'group');
  select(_cueSheet, 1, 3);
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
      cursor: 'pointer',
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
    tap(cueSheet, 'ArrowDown', 3);
    transition(cueSheet, 'Edit');
    select(cueSheet, 1, 3);
    act(cueSheet, 'group');
    transition(cueSheet, 'Save');
    expect(position(cueSheet)).toEqual({ pointer: 2, pressed: null });
    tap(cueSheet, 'ArrowDown', 10);
    expect(position(cueSheet).pointer).toBe(SHEET.length - 3);
  });

  it('keeps the saved sheet and the pointer after edits and Cancel', () => {
    const { cueSheet } = editing(2);
    editAll(cueSheet);
    transition(cueSheet, 'Cancel');
    expect(get(cueSheet.strip).tools).toBeNull();
    expect([get(cueSheet.strip).cells, position(cueSheet).pointer]).toEqual([SHEET, 2]);
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

  it('ungroups a selected sequence into its items, in order, and offers no Ungroup on a cell without constituents', () => {
    const { cueSheet, shown } = editing();
    select(cueSheet, 2);
    act(cueSheet, 'ungroup');
    expect(shown().cells).toEqual([SHEET[0], SHEET[1], ...SABOTS.items, ...SHEET.slice(3)]);
    select(cueSheet, 0);
    expect(get(cueSheet.strip).actions?.ungroup).toBeNull();
  });

  it('groups the selection, made in either direction, from its lowest to its highest cell into one sequence', () => {
    const grouped = (_from: number, _to: number) => {
      const { cueSheet, shown } = editing();
      select(cueSheet, _from, _to);
      act(cueSheet, 'group');
      return shown().cells;
    };
    const expected = [SHEET[0], sequence('Pose → Hello', SHEET[1], SHEET[2], SHEET[3]), ...SHEET.slice(4)];
    expect(grouped(1, 3)).toEqual(expected);
    expect(grouped(3, 1)).toEqual(expected);
  });

  it('restores the draft by ungrouping what a Group made', () => {
    const { cueSheet, shown } = editing();
    select(cueSheet, 1, 3);
    const before = shown();
    act(cueSheet, 'group');
    act(cueSheet, 'ungroup');
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
    ['rename(-1)', (_s: CueSheet) => _s.rename(-1, 'X')],
    ['rename(6)', (_s: CueSheet) => _s.rename(6, 'X')],
    ['reorder(0, 6)', (_s: CueSheet) => _s.reorder(0, 6)],
    ['reorder(6, 0)', (_s: CueSheet) => _s.reorder(6, 0)],
    ['a click on cell 6', (_s: CueSheet) => click(_s, 6)],
    ['a click on cell 1.5', (_s: CueSheet) => click(_s, 1.5)],
    ['a shift-click on cell -1', (_s: CueSheet) => click(_s, -1, true)],
  ])('leaves the draft as it is on %s', (_name, _edit) => {
    const { cueSheet, shown } = editing(3);
    select(cueSheet, 1);
    const before = shown();
    _edit(cueSheet);
    expect(shown()).toEqual(before);
  });

  it('does nothing on any edit method in play mode', () => {
    const { cueSheet } = setup(SHEET);
    const data = () => pick(get(cueSheet.strip), ['cells', 'pointer', 'pressed', 'selection', 'renaming', 'tools']);
    const before = data();
    editMethods(cueSheet);
    expect(data()).toEqual(before);
    expect(before.tools).toBeNull();
  });

  it('selects a cell, extends the selection from its first cell, and extends an empty one to one cell', () => {
    const { cueSheet, shown } = editing();
    select(cueSheet, 2, 4);
    expect(shown().selection).toEqual([2, 3, 4]);
    click(cueSheet, 0, true);
    expect(shown().selection).toHaveLength(5);
    expect(shown().selection).toEqual(expect.arrayContaining(range(0, 5)));

    const { cueSheet: empty, shown: shownEmpty } = editing();
    click(empty, 3, true);
    expect(shownEmpty().selection).toEqual([3]);
  });

  it('selects on a click and extends on a shift-click with the Select tool, and sends nothing', () => {
    const { cueSheet, sent, shown } = editing();
    click(cueSheet, 2);
    click(cueSheet, 4, true);
    expect(shown().selection).toEqual([2, 3, 4]);
    expect(sent()).toEqual([]);
  });

  it('renames on a click with the Rename tool, and keeps the selection and the tool', () => {
    const { cueSheet, sent, shown } = editing();
    select(cueSheet, 1);
    get(cueSheet.strip).tools?.Rename();
    expect(shown()).toMatchObject({ cursor: 'text', tool: 'Rename' });
    click(cueSheet, 2);
    expect(shown()).toMatchObject({ renaming: 2, selection: [1] });
    cueSheet.stopRenaming();
    expect(shown()).toMatchObject({ renaming: null, selection: [1] });
    expect(shown().cells[2].label).toBe('Sabots');
    click(cueSheet, 2);
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
    [[3, 4], true, false],
    [[2, 3, 4, 5], true, true],
  ])('offers Group and Ungroup on the selection %j: %s, %s', (_selection, _group, _ungroup) => {
    const { cueSheet } = editing();
    _selection.forEach((_index) => click(cueSheet, _index, true));
    expect(get(cueSheet.strip).actions?.group !== null).toBe(_group);
    expect(get(cueSheet.strip).actions?.ungroup !== null).toBe(_ungroup);
  });

  it('ungroups the one group of the selection, and selects the run the selection covered', () => {
    const { cueSheet, shown } = editing();
    select(cueSheet, 1, 3);
    act(cueSheet, 'ungroup');
    expect(shown().cells).toEqual([SHEET[0], SHEET[1], ...SABOTS.items, ...SHEET.slice(3)]);
    expect(shown().selection).toEqual([1, 2, 3, 4, 5]);
  });

  it('ungroups every group of the selection in one change, and keeps the cells outside it', () => {
    const { cueSheet, shown } = editing(0, memoryStorage(), TWO_GROUPS);
    const lengths: number[] = [];
    const unsubscribe = cueSheet.strip.subscribe((_strip) => void lengths.push(_strip.cells.length));
    select(cueSheet, 1, 3);
    act(cueSheet, 'ungroup');
    unsubscribe();
    expect(shown().cells).toEqual([TWO_GROUPS[0], ...SABOTS.items, TWO_GROUPS[2], ...BYE.items, TWO_GROUPS[4]]);
    expect(shown().selection).toEqual([1, 2, 3, 4, 5, 6]);
    expect(lengths).toEqual([5, 5, 5, 8]);
  });

  it.each([
    ['Ungroup', 2, 2, (_cueSheet: CueSheet) => act(_cueSheet, 'ungroup')],
    ['Group', 1, 3, (_cueSheet: CueSheet) => act(_cueSheet, 'group')],
    ['reorder', 1, 1, (_cueSheet: CueSheet) => _cueSheet.reorder(1, 3)],
  ])('ends a rename on %s', (_name, _from, _to, _edit) => {
    const { cueSheet, shown } = editing();
    select(cueSheet, _from, _to);
    get(cueSheet.strip).tools?.Rename();
    click(cueSheet, 2);
    expect(shown().renaming).toBe(2);
    _edit(cueSheet);
    expect(shown().renaming).toBeNull();
  });

  describe('moves the pointer and the selection', () => {
    it.each([
      [3, 3],
      [0, 0],
    ])('keeps both on rename, with the pointer at %i', (_pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      select(cueSheet, 4);
      cueSheet.rename(1, 'X');
      expect([shown().pointer, shown().selection]).toEqual([_after, [4]]);
    });

    it.each([
      ['before the cell', 1, 1],
      ['on the cell', 2, 2],
      ['after the cell', 4, 6],
    ])('on Ungroup of cell 2 into 3 cells, with the pointer %s', (_where, _pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      select(cueSheet, 2);
      act(cueSheet, 'ungroup');
      expect([shown().pointer, shown().selection]).toEqual([_after, [2, 3, 4]]);
    });

    it.each([
      ['before both groups', 0, 0],
      ['on the first group', 1, 1],
      ['between the groups', 2, 1],
      ['on the second group', 3, 1],
      ['after both groups', 4, 7],
    ])('on Ungroup over cells 1 to 3, two groups of 3 and 2 cells, with the pointer %s', (_where, _pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer, memoryStorage(), TWO_GROUPS);
      select(cueSheet, 1, 3);
      act(cueSheet, 'ungroup');
      expect([shown().pointer, shown().selection]).toEqual([_after, [1, 2, 3, 4, 5, 6]]);
    });

    it.each([
      ['before lo', 0, 0],
      ['on lo', 1, 1],
      ['inside', 2, 1],
      ['on hi', 3, 1],
      ['after hi', 5, 3],
    ])('on Group of cells 1 to 3, with the pointer %s', (_where, _pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      select(cueSheet, 1, 3);
      act(cueSheet, 'group');
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
      expect(shown()).toMatchObject({ pointer: 1, pressed: null });
      cueSheet.release(_key);
      transition(cueSheet, 'Cancel');
      expect([sent(), position(cueSheet)]).toEqual([[], { pointer: 1, pressed: null }]);
    },
  );

  it('still toggles Pose on a', () => {
    const { cueSheet, sent } = editing(1);
    cueSheet.press('a');
    expect(sent()).toEqual(asSent(ENTER_POSE));
  });
});

describe('cueSheet in storage', () => {
  it('starts a second sheet on the same storage with the sheet the first one saved', () => {
    const storage = memoryStorage();
    const { cueSheet } = editing(0, storage);
    cueSheet.rename(1, 'X');
    select(cueSheet, 3, 4);
    act(cueSheet, 'group');
    transition(cueSheet, 'Save');
    expect(storage.entries.has('cueSheet.v1')).toBe(true);
    const { cueSheet: reloaded } = setup(SHEET, storage);
    expect(get(reloaded.strip).cells).toEqual(get(cueSheet.strip).cells);
    expect(get(reloaded.strip).cells).not.toEqual(SHEET);
  });

  it.each(['Cancel', 'Reset'])('leaves the storage as it is after edits and %s', (_name) => {
    const storage = memoryStorage();
    const { cueSheet } = editing(0, storage);
    cueSheet.rename(0, 'Saved');
    transition(cueSheet, 'Save');
    const before = [...storage.entries];
    transition(cueSheet, 'Edit');
    editAll(cueSheet);
    transition(cueSheet, _name);
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
    expect(get(cueSheet.strip).cells).toEqual(SHEET);
  });

  it('works in memory on a storage that throws on every access', () => {
    const refuse = () => {
      throw new Error('Storage is forbidden.');
    };
    const { cueSheet } = setup(SHEET, { getItem: refuse, setItem: refuse });
    expect(get(cueSheet.strip).cells).toEqual(SHEET);
    expect(() => {
      transition(cueSheet, 'Edit');
      editAll(cueSheet);
      transition(cueSheet, 'Reset');
      editAll(cueSheet);
      transition(cueSheet, 'Cancel');
      transition(cueSheet, 'Edit');
      cueSheet.rename(1, 'X');
      transition(cueSheet, 'Save');
    }).not.toThrow();
    expect(get(cueSheet.strip).cells).toEqual([SHEET[0], { ...SHEET[1], label: 'X' }, ...SHEET.slice(2)]);
  });
});
