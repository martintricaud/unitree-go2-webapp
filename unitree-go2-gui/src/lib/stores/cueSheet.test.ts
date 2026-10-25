import { describe, it, expect } from 'vitest';
import { keys, pick, times } from 'remeda';
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
    get(cueSheet.strip).click(2);
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

/** Runs the transition `_name` that the strip of `_cueSheet` offers in its current mode, and throws
 * when that mode does not offer it. */
const transition = (_cueSheet: CueSheet, _name: string) => {
  const run = new Map(Object.entries(get(_cueSheet.strip).transitions)).get(_name);
  if (run === undefined) throw new Error(`The strip offers no ${_name} in this mode.`);
  run();
};

/** The names of the edit tools, as the strip shows the active one. */
type Tool = NonNullable<ReturnType<ReturnType<typeof editing>['shown']>['tool']>;

/** Makes `_name` the active tool of the strip of `_cueSheet`; does nothing in play mode. */
const choose = (_cueSheet: CueSheet, _name: Tool) => get(_cueSheet.strip).tools?.[_name]();

/** Clicks cell `_index` of the strip of `_cueSheet`. */
const click = (_cueSheet: CueSheet, _index: number) => get(_cueSheet.strip).click(_index);

/** Presses on cell `_from` of the strip of `_cueSheet` and releases on cell `_to`. */
const sweep = (_cueSheet: CueSheet, _from: number, _to: number) => get(_cueSheet.strip).sweep(_from, _to);

/** Groups cells `_from` to `_to` with the Group tool. */
const groupSweep = (_cueSheet: CueSheet, _from: number, _to: number) => {
  choose(_cueSheet, 'Group');
  sweep(_cueSheet, _from, _to);
};

/** Ungroups cell `_index` with the Ungroup tool. */
const ungroupClick = (_cueSheet: CueSheet, _index: number) => {
  choose(_cueSheet, 'Ungroup');
  click(_cueSheet, _index);
};

/** A sheet of `_cues` on `_storage` with its pointer moved to `_pointer` in play mode, then switched
 * to edit mode. `shown` reads what the strip shows, with the active tool in place of the tools. */
const editing = (_pointer = 0, _storage = memoryStorage(), _cues = SHEET) => {
  const { cueSheet, robot, sent } = setup(_cues, _storage);
  const shown = () => {
    const { cells, pointer, pressed, renaming, cursor, draggable, tools } = get(cueSheet.strip);
    return { cells, pointer, pressed, renaming, cursor, draggable, tool: tools?.active ?? null };
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

/** Makes every kind of edit once, with indices inside the sheet: the edit methods, an Ungroup, a
 * Group, and a rename left open. */
const editAll = (_cueSheet: CueSheet) => {
  editMethods(_cueSheet);
  ungroupClick(_cueSheet, 2);
  groupSweep(_cueSheet, 3, 4);
  choose(_cueSheet, 'Rename');
  click(_cueSheet, 1);
};

describe('cueSheet in edit mode', () => {
  it('shows the saved sheet in play mode, and a draft of it with the Move tool after Edit', () => {
    const { cueSheet, sent } = setup(SHEET);
    const play = get(cueSheet.strip);
    expect(pick(play, ['cells', 'pointer', 'pressed', 'renaming', 'cursor', 'draggable'])).toEqual({
      cells: SHEET,
      pointer: 0,
      pressed: null,
      renaming: null,
      cursor: 'pointer',
      draggable: false,
    });
    expect([play.tools, keys(play.transitions), play.run(0, 2)]).toEqual([null, ['Edit'], []]);
    play.sweep(0, 2);
    play.click(3);
    expect(sent()).toEqual(asSent(SHEET[3]));

    const { cueSheet: edited, shown } = editing(2);
    expect(shown()).toEqual({
      cells: SHEET,
      pointer: 2,
      pressed: null,
      renaming: null,
      cursor: 'grab',
      draggable: true,
      tool: 'Move',
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
    get(cueSheet.strip).click(1);
    expect(sent()).toEqual(asSent(renamed));
  });

  it('saves the draft pointer, clears the pressed cell, and clamps the pointer to the saved length', () => {
    const { cueSheet } = setup(SHEET);
    cueSheet.press('ArrowRight');
    tap(cueSheet, 'ArrowDown', 3);
    transition(cueSheet, 'Edit');
    groupSweep(cueSheet, 1, 3);
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

  it('starts a new draft of the saved sheet with the Move tool after edits and Reset, and stays in edit mode', () => {
    const { cueSheet, shown } = editing(2);
    const before = shown();
    editAll(cueSheet);
    expect(shown()).toMatchObject({ tool: 'Rename', renaming: 1 });
    transition(cueSheet, 'Reset');
    expect(shown()).toEqual(before);
    expect(shown()).toMatchObject({ cells: SHEET, tool: 'Move' });
  });

  it.each([
    ['Move', 'grab', true],
    ['Rename', 'text', false],
    ['Group', 'cell', false],
    ['Ungroup', 'pointer', false],
  ] as const)('shows the %s tool with the cursor %s, and draggable cells: %s', (_tool, _cursor, _draggable) => {
    const { cueSheet, shown } = editing();
    choose(cueSheet, _tool);
    expect(shown()).toMatchObject({ tool: _tool, cursor: _cursor, draggable: _draggable });
  });

  it.each([
    ['Move', SHEET, null],
    ['Rename', SHEET, 2],
    ['Group', SHEET, null],
    ['Ungroup', [SHEET[0], SHEET[1], ...SABOTS.items, ...SHEET.slice(3)], null],
  ] as const)('makes of a click on a group with the %s tool the cells %j, renaming %s', (_tool, _cells, _renaming) => {
    const { cueSheet, sent, shown } = editing();
    choose(cueSheet, _tool);
    click(cueSheet, 2);
    expect(shown()).toMatchObject({ cells: _cells, renaming: _renaming, tool: _tool });
    expect(sent()).toEqual([]);
  });

  it.each([
    ['Move', SHEET],
    ['Rename', SHEET],
    ['Group', [sequence('FreeWalk → Pose', SHEET[0], SHEET[1]), ...SHEET.slice(2)]],
    ['Ungroup', SHEET],
  ] as const)('makes of a sweep from cell 0 to cell 1 with the %s tool the cells %j', (_tool, _cells) => {
    const { cueSheet, sent, shown } = editing();
    choose(cueSheet, _tool);
    sweep(cueSheet, 0, 1);
    expect(shown()).toMatchObject({ cells: _cells, tool: _tool });
    expect(sent()).toEqual([]);
  });

  it('highlights the swept run only with the Group tool, in either direction', () => {
    const { cueSheet } = editing();
    expect(get(cueSheet.strip).run(3, 1)).toEqual([]);
    choose(cueSheet, 'Group');
    expect(get(cueSheet.strip).run(3, 1)).toEqual([1, 2, 3]);
    expect(get(cueSheet.strip).run(1, 3)).toEqual([1, 2, 3]);
  });

  it('replaces a group clicked with the Ungroup tool by its constituents, and leaves a cell without constituents', () => {
    const { cueSheet, shown } = editing();
    ungroupClick(cueSheet, 2);
    expect(shown().cells).toEqual([SHEET[0], SHEET[1], ...SABOTS.items, ...SHEET.slice(3)]);
    const before = shown();
    click(cueSheet, 0);
    expect(shown()).toEqual(before);
  });

  it('groups the cells of a sweep made in either direction into one sequence, and does nothing on a sweep to the same cell', () => {
    const grouped = (_from: number, _to: number) => {
      const { cueSheet, shown } = editing();
      groupSweep(cueSheet, _from, _to);
      return shown();
    };
    const expected = [SHEET[0], sequence('Pose → Hello', SHEET[1], SHEET[2], SHEET[3]), ...SHEET.slice(4)];
    expect(grouped(1, 3).cells).toEqual(expected);
    expect(grouped(3, 1)).toEqual(grouped(1, 3));

    const { cueSheet, shown } = editing();
    choose(cueSheet, 'Group');
    const before = shown();
    sweep(cueSheet, 2, 2);
    sweep(cueSheet, 4, 4);
    expect(shown()).toEqual(before);
  });

  it('restores the draft by ungrouping what a Group made', () => {
    const { cueSheet, shown } = editing();
    const before = shown();
    groupSweep(cueSheet, 1, 3);
    ungroupClick(cueSheet, 1);
    choose(cueSheet, 'Move');
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
    ['rename(-1)', 'Move', (_s: CueSheet) => _s.rename(-1, 'X')],
    ['rename(6)', 'Move', (_s: CueSheet) => _s.rename(6, 'X')],
    ['reorder(0, 6)', 'Move', (_s: CueSheet) => _s.reorder(0, 6)],
    ['reorder(6, 0)', 'Move', (_s: CueSheet) => _s.reorder(6, 0)],
    ['a Rename click on cell 6', 'Rename', (_s: CueSheet) => click(_s, 6)],
    ['a Rename click on cell 1.5', 'Rename', (_s: CueSheet) => click(_s, 1.5)],
    ['an Ungroup click on cell 6', 'Ungroup', (_s: CueSheet) => click(_s, 6)],
    ['a Group sweep from cell -1 to cell 2', 'Group', (_s: CueSheet) => sweep(_s, -1, 2)],
    ['a Group sweep from cell 3 to cell 6', 'Group', (_s: CueSheet) => sweep(_s, 3, 6)],
  ] as const)('leaves the draft as it is on %s', (_name, _tool, _edit) => {
    const { cueSheet, shown } = editing(3);
    choose(cueSheet, _tool);
    const before = shown();
    _edit(cueSheet);
    expect(shown()).toEqual(before);
  });

  it('does nothing on any edit method in play mode', () => {
    const { cueSheet } = setup(SHEET);
    const data = () => pick(get(cueSheet.strip), ['cells', 'pointer', 'pressed', 'renaming', 'tools']);
    const before = data();
    editMethods(cueSheet);
    expect(data()).toEqual(before);
    expect(before.tools).toBeNull();
  });

  it('renames on a click with the Rename tool, keeps the tool, and ends the rename on another tool', () => {
    const { cueSheet, sent, shown } = editing();
    choose(cueSheet, 'Rename');
    click(cueSheet, 2);
    expect(shown()).toMatchObject({ renaming: 2, tool: 'Rename' });
    cueSheet.stopRenaming();
    expect(shown().renaming).toBeNull();
    expect(shown().cells[2].label).toBe('Sabots');
    click(cueSheet, 2);
    cueSheet.rename(2, 'ay b');
    expect(shown()).toMatchObject({ renaming: null, tool: 'Rename' });
    expect(shown().cells[2].label).toBe('ay b');
    click(cueSheet, 3);
    choose(cueSheet, 'Move');
    expect(shown()).toMatchObject({ renaming: null, cursor: 'grab', tool: 'Move' });
    expect(sent()).toEqual([]);
  });

  it('ends a rename on reorder', () => {
    const { cueSheet, shown } = editing();
    choose(cueSheet, 'Rename');
    click(cueSheet, 2);
    cueSheet.reorder(1, 3);
    expect(shown().renaming).toBeNull();
  });

  describe('moves the pointer', () => {
    it.each([
      [3, 3],
      [0, 0],
    ])('nowhere on rename, with the pointer at %i', (_pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      cueSheet.rename(1, 'X');
      expect(shown().pointer).toBe(_after);
    });

    it.each([
      ['before the cell', 1, 1],
      ['on the cell', 2, 2],
      ['after the cell', 4, 6],
    ])('on Ungroup of cell 2 into 3 cells, with the pointer %s', (_where, _pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      ungroupClick(cueSheet, 2);
      expect(shown().pointer).toBe(_after);
    });

    it.each([
      ['before lo', 0, 0],
      ['on lo', 1, 1],
      ['inside', 2, 1],
      ['on hi', 3, 1],
      ['after hi', 5, 3],
    ])('on Group of cells 1 to 3, with the pointer %s', (_where, _pointer, _after) => {
      const { cueSheet, shown } = editing(_pointer);
      groupSweep(cueSheet, 3, 1);
      expect(shown().pointer).toBe(_after);
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
      expect(shown().pointer).toBe(_after);
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
    groupSweep(cueSheet, 3, 4);
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
