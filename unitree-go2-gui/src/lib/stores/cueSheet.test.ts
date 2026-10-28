import { describe, it, expect } from 'vitest';
import { evolve, filter, flat, flatMap, forEach, keys, map, merge, omit, pick, pipe, prop, set, times, values } from 'remeda';
import * as v from 'valibot';
import { CONDUITE, presets } from '../data/cues';
import { POSTURES, cells as numbered, compiled, enter, leave, perform, sequence, set as setting, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { nextId, opened } from '../utils/trees';
import { CueSheet, documentSchema, SHEET_TOOLS } from './cueSheet.svelte';
import { OutcomeLog } from './outcomes.svelte';
import { Robot } from './robot.svelte';

const CUES: [Cue, ...Cue[]] = [enter('FreeWalk'), perform('Hello'), wait(1)];

/** The label and steps of each cue, as the robot writes them to the relay. */
const asSent = (..._cues: Cue[]) => map(_cues, (_cue) => ({ command_name: _cue.label, sequence: compiled(_cue).steps }));

/** A storage that keeps its entries in `entries`, as `localStorage` keeps them across reloads. */
const memoryStorage = (_entries = new Map<string, string>()) => ({
  entries: _entries,
  getItem: (_key: string) => _entries.get(_key) ?? null,
  setItem: (_key: string, _value: string) => void _entries.set(_key, _value),
});

/** A cue sheet of its own on `_storage`, on a fresh robot whose open socket the relay never answers,
 * so every cue sent stays pending. Unless `_connected` is false, the relay reports the robot
 * connected in its boot gait, so every pane button can send. `sent` reads each cue the robot wrote,
 * as `asSent` shows it. */
const setup = (_cues = CUES, _storage: Pick<Storage, 'getItem' | 'setItem'> = memoryStorage(), _connected = true) => {
  const frames: string[] = [];
  const send = (_frame: string) => void frames.push(_frame);
  const socket = { readyState: 1, send, onopen: null, onclose: null, onmessage: null as ((_event: { data: string }) => void) | null };
  const robot = new Robot({ openSocket: () => socket, outcomeLog: new OutcomeLog() });
  robot.connect();
  const reports = [{ type: 'robot_state', connected: true }, { type: 'sport_state', motionMode: 'mcf', errorCode: 0 }];
  forEach(_connected ? reports : [], (_report) => socket.onmessage?.({ data: JSON.stringify(_report) }));
  const cueSheet = new CueSheet(_cues, robot, _storage);
  const sent = () => map(frames, (_frame) => pick(JSON.parse(_frame), ['command_name', 'sequence']));
  /** Confirms the latest request, as the relay would. */
  const confirm = () =>
    socket.onmessage?.({
      data: JSON.stringify({ type: 'command_result', reqId: JSON.parse(frames[frames.length - 1]).reqId, outcome: 'confirmed', code: 0, detail: null, command_name: null }),
    });
  return { cueSheet, robot, sent, confirm };
};

/** The state of `_cueSheet`, with the saved and the shown document each reduced to its sheet. */
const sheets = (_cueSheet: CueSheet) => evolve(_cueSheet.state, { saved: prop('sheet'), shown: prop('sheet') });

/** The pointer of `_cueSheet`, and the identifier of its pressed cell. */
const position = (_cueSheet: CueSheet) => ({ pointer: _cueSheet.state.pointer, pressed: _cueSheet.state.pressed?.id ?? null });

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
    const cells = numbered(CUES, 0);
    expect(sheets(cueSheet)).toEqual({ saved: cells, shown: cells, pointer: 0, pressed: null, instrument: 'Fire', renaming: null, key: null, problem: null });
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
    ['b', enter('Bound')],
    ['x', enter('Sitting')],
    ['y', presets.dance],
  ] as const)('sends the cue %s is linked to in the default document, draws it pressed, and leaves the pointer', (_key, _cue) => {
    const { cueSheet, sent } = setup(CONDUITE);
    cueSheet.press(_key);
    expect([sent(), position(cueSheet)]).toEqual([asSent(_cue), { pointer: 0, pressed: cueSheet.linked(_key)?.id }]);
  });

  it('draws the Dance cell pressed while y is held, and ends it on the release of y only', () => {
    const { cueSheet } = setup(CONDUITE);
    const dance = filter(cueSheet.state.saved.sheet, (_cell) => _cell.label === presets.dance.label)[0];
    cueSheet.press('y');
    cueSheet.release('a');
    expect(cueSheet.isPressed(dance)).toBe(true);
    cueSheet.release('y');
    expect(cueSheet.state.pressed).toBeNull();
  });

  it('does nothing on an unbound key, nor on a key whose default cue the sheet lacks', () => {
    expect(pressOnce('z')).toEqual({ sent: [], pointer: 0, pressed: null });
    expect(pressOnce('toString')).toEqual({ sent: [], pointer: 0, pressed: null });
    expect(pressOnce('y')).toEqual({ sent: [], pointer: 0, pressed: null });
  });

  it('sends nothing for a toggle whose fields wait for a verdict, and still sends a sheet cell', () => {
    const { cueSheet, robot, sent } = setup(CONDUITE);
    cueSheet.press('a');
    expect(robot.current.state.pending.posture).toBeDefined();
    // Pose, Sit and Bound all toggle the posture, which waits.
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

  it('selects b under Assign from Move, and sends nothing', () => {
    const { cueSheet, sent } = setup();
    cueSheet.choose('Move');
    cueSheet.press('b');
    expect([sent(), pick(cueSheet.state, ['instrument', 'key'])]).toEqual([[], { instrument: 'Assign', key: 'b' }]);
  });

  it('deselects the key when Group is chosen from Assign', () => {
    const { cueSheet } = setup();
    cueSheet.selectKey('b');
    cueSheet.choose('Group');
    expect(pick(cueSheet.state, ['instrument', 'key'])).toEqual({ instrument: 'Group', key: null });
  });
});

describe('cueSheet as a store', () => {
  it('applies a detached update', () => {
    const { cueSheet } = setup();
    const { update } = cueSheet;
    update(set('pointer', 2));
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
/** SHEET as the cue sheet holds it: identifiers 0 to 10 in pre-order. */
const CELLS = numbered(SHEET, 0);

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
  return { cueSheet, sent, state: () => cueSheet.state };
};

describe('cueSheet sweeps', () => {
  it('moves cell 0 of CONDUITE to position 2, and keeps the pointer on its cell', () => {
    const { cueSheet, state } = editing('Move', 1, CONDUITE);
    cueSheet.sweep(0, 2);
    expect(map(state().shown.sheet.slice(0, 3), (_cell) => _cell.label)).toEqual(['Pose', 'Sabots', 'FreeWalk']);
    expect(state().shown.sheet[state().pointer]).toEqual(numbered(CONDUITE, 0)[1]);
  });

  it.each([
    [1, 4],
    [4, 1],
  ])('moves only cell %i to position %i, and keeps the pointer on its cell wherever it is', (_from, _to) => {
    times(SHEET.length, (_pointer) => {
      const { cueSheet, state } = editing('Move', _pointer);
      cueSheet.sweep(_from, _to);
      expect(state().shown.sheet[_to]).toEqual(CELLS[_from]);
      expect(state().shown.sheet[state().pointer]).toEqual(CELLS[_pointer]);
    });
    const { cueSheet, state } = editing('Move');
    cueSheet.sweep(_from, _to);
    expect(state().shown.sheet).toEqual(map(_from < _to ? [0, 2, 3, 4, 1, 5] : [0, 4, 1, 2, 3, 5], (_index) => CELLS[_index]));
  });

  it('groups a sweep made in either direction into one sequence with a new identifier, and leaves a sweep of one cell', () => {
    // The new identifier is above the pane's, which are numbered after the sheet's.
    const id = nextId([...CELLS, ...pipe(editing('Group').cueSheet.state.shown.pane, values(), flat())]);
    const expected = [CELLS[0], { id, label: 'Pose → Hello', items: [CELLS[1], CELLS[2], CELLS[3]] }, ...CELLS.slice(4)];
    times(2, (_reverse) => {
      const { cueSheet, state } = editing('Group');
      cueSheet.sweep(_reverse ? 3 : 1, _reverse ? 1 : 3);
      expect(state().shown.sheet).toEqual(expected);
    });
    const { cueSheet, state } = editing('Group');
    const before = state();
    cueSheet.sweep(2, 2);
    expect(state()).toEqual(before);
  });

  it.each([
    ['before lo', 0, 0],
    ['on lo', 1, 1],
    ['inside', 2, 1],
    ['on hi', 3, 1],
    ['after hi', 5, 3],
  ])('moves the pointer %s of a Group of cells 1 to 3', (_where, _pointer, _after) => {
    const { cueSheet, state } = editing('Group', _pointer);
    cueSheet.sweep(3, 1);
    expect(state().pointer).toBe(_after);
  });

  it('replaces both groups of a swept range by their constituents, and keeps its plain cell', () => {
    const cues: [Cue, ...Cue[]] = [enter('FreeWalk'), SABOTS, perform('Hello'), BYE, wait(1)];
    const { cueSheet, state } = editing('Ungroup', 0, cues);
    cueSheet.sweep(3, 1);
    const cells = numbered(cues, 0);
    expect(state().shown.sheet).toEqual([cells[0], ...opened(cells[1]), cells[2], ...opened(cells[3]), cells[4]]);
  });

  it.each([
    ['before the cell', 1, 1],
    ['on the cell', 2, 2],
    ['after the cell', 4, 6],
  ])('moves the pointer %s on an Ungroup of cell 2 into 3 cells', (_where, _pointer, _after) => {
    const { cueSheet, state } = editing('Ungroup', _pointer);
    cueSheet.sweep(2, 2);
    expect(state().pointer).toBe(_after);
  });

  it('starts renaming the cell a Rename sweep ends on, and sends nothing', () => {
    const { cueSheet, sent, state } = editing('Rename');
    cueSheet.sweep(0, 2);
    expect(sheets(cueSheet)).toMatchObject({ shown: CELLS, renaming: 2, instrument: 'Rename' });
    expect(sent()).toEqual([]);
  });

  it('does not start renaming a wait cell, whose label states its duration', () => {
    const { cueSheet, state } = editing('Rename');
    cueSheet.sweep(0, 4);
    expect(state().renaming).toBeNull();
  });
});

describe('cueSheet sweeps in progress', () => {
  it('previews a Move as its release will leave the cells, and highlights only the moved cell', () => {
    const { cueSheet, state } = editing('Move');
    const preview = cueSheet.instruments.Move.shown(1, 4)(state().shown.sheet);
    expect(cueSheet.instruments.Move.swept(1, 4)).toEqual([4]);
    cueSheet.sweep(1, 4);
    expect(preview).toEqual(state().shown.sheet);
  });

  it('highlights nothing under Fire, and shows the cells unchanged', () => {
    const { cueSheet, state } = editing('Fire');
    expect(cueSheet.instruments.Fire.swept(1, 4)).toEqual([]);
    expect(cueSheet.instruments.Fire.shown(1, 4)(state().shown.sheet)).toEqual(state().shown.sheet);
  });

  it.each(['Rename', 'Group', 'Ungroup'] as const)('highlights the swept range in either direction under %s', (_name) => {
    const { cueSheet, state } = editing(_name);
    expect(cueSheet.instruments[_name].swept(3, 1)).toEqual([1, 2, 3]);
    expect(cueSheet.instruments[_name].shown(3, 1)(state().shown.sheet)).toEqual(state().shown.sheet);
  });
});

describe('cueSheet edits', () => {
  it('renames a cell and ends the rename, keeps the label on stopRenaming, and ends a rename on another change', () => {
    const { cueSheet, state } = editing('Rename');
    cueSheet.sweep(2, 2);
    cueSheet.stopRenaming();
    expect(state()).toMatchObject({ renaming: null, instrument: 'Rename' });
    expect(state().shown.sheet[2].label).toBe('Sabots');
    cueSheet.sweep(2, 2);
    cueSheet.rename(2, 'ay b');
    expect(state()).toMatchObject({ renaming: null, instrument: 'Rename' });
    expect(state().shown.sheet[2]).toEqual(set(CELLS[2], 'label', 'ay b'));
    cueSheet.sweep(3, 3);
    cueSheet.reorder(1, 3);
    expect(state().renaming).toBeNull();
    cueSheet.sweep(3, 3);
    cueSheet.choose('Move');
    expect(state().renaming).toBeNull();
  });

  it('saves the shown cells, clears the pressed cell, returns to Fire, and sends a renamed cell under its new label', () => {
    const { cueSheet, sent } = setup(SHEET);
    const state = () => cueSheet.state;
    cueSheet.press('ArrowRight');
    cueSheet.choose('Rename');
    cueSheet.rename(1, 'X');
    cueSheet.save();
    const renamed = merge(CELLS[1], { label: 'X' });
    const cells = [CELLS[0], renamed, ...CELLS.slice(2)];
    expect(sheets(cueSheet)).toEqual({ saved: cells, shown: cells, pointer: 1, pressed: null, instrument: 'Fire', renaming: null, key: null, problem: null });
    cueSheet.sweep(1, 1);
    expect(sent()).toEqual(asSent(CELLS[0], renamed));
  });

  it('restores the saved cells on Cancel, returns to Fire, and keeps the pointer index, clamped to the saved length', () => {
    const { cueSheet, state } = editing('Group', 4);
    cueSheet.sweep(0, 3);
    expect(state().pointer).toBe(1);
    cueSheet.cancel();
    expect(sheets(cueSheet)).toEqual({ saved: CELLS, shown: CELLS, pointer: 1, pressed: null, instrument: 'Fire', renaming: null, key: null, problem: null });

    const { cueSheet: grown, state: grownState } = editing('Ungroup', 5);
    grown.sweep(2, 2);
    expect(grownState().pointer).toBe(7);
    grown.cancel();
    expect(sheets(grown)).toMatchObject({ shown: CELLS, pointer: SHEET.length - 1, instrument: 'Fire' });
  });

  it('shows the saved cells again on Reset, keeps the instrument, and ends any rename', () => {
    const { cueSheet, state } = editing('Ungroup', 5);
    cueSheet.sweep(2, 2);
    cueSheet.choose('Rename');
    cueSheet.sweep(1, 1);
    cueSheet.reset();
    expect(sheets(cueSheet)).toEqual({ saved: CELLS, shown: CELLS, pointer: SHEET.length - 1, pressed: null, instrument: 'Rename', renaming: null, key: null, problem: null });
  });
});

describe('cueSheet in storage', () => {
  it('starts a second sheet on the same storage with the cells and identifiers the first one saved', () => {
    const storage = memoryStorage();
    const { cueSheet } = editing('Group', 0, SHEET, storage);
    cueSheet.sweep(3, 4);
    cueSheet.rename(0, 'Renamed');
    cueSheet.save();
    expect([...storage.entries.keys()]).toEqual(['cueSheet.v2']);
    const { cueSheet: reloaded } = setup(SHEET, storage);
    expect(reloaded.state.shown.sheet).toEqual(cueSheet.state.shown.sheet);
    expect(reloaded.state.shown.pane).toEqual(cueSheet.state.shown.pane);
    expect(reloaded.state.shown.sheet).not.toEqual(CELLS);
  });

  it.each([...SHEET_TOOLS, 'Assign'] as const)('stores the shown document on Save under %s, and returns to Fire', (_instrument) => {
    const storage = memoryStorage();
    const { cueSheet } = editing(_instrument, 0, SHEET, storage);
    cueSheet.rename(0, 'Saved');
    cueSheet.save();
    expect(setup(SHEET, storage).cueSheet.state.shown.sheet[0].label).toBe('Saved');
    expect(cueSheet.state.instrument).toBe('Fire');
  });

  it('rejects a pane group holding a cell of another kind, at that cell', () => {
    const { cueSheet } = setup();
    const { sheet, pane } = cueSheet.state.shown;
    const document = { sheet, pane: set(pane, 'gaits', [pane.postures[0]]), bindings: {} };
    const parsed = v.safeParse(documentSchema, JSON.parse(JSON.stringify(document)));
    expect(map(parsed.issues ?? [], (_issue) => v.getDotPath(_issue))).toEqual(['pane.gaits.0.args.0']);
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
    ['cueSheet.v1', JSON.stringify(SHEET)],
    ['cueSheet.v2', 'not json'],
    ['cueSheet.v2', JSON.stringify(numbered([wait(2)], 0))],
  ])('starts from the given cues, numbered from 0, when %s holds %s', (_key, _stored) => {
    const { cueSheet } = setup(SHEET, memoryStorage(new Map([[_key, _stored]])));
    expect(cueSheet.state.shown.sheet).toEqual(CELLS);
  });

  it('works in memory on a storage that throws on every access', () => {
    const refuse = () => {
      throw new Error('Storage is forbidden.');
    };
    const { cueSheet } = editing('Rename', 0, SHEET, { getItem: refuse, setItem: refuse });
    expect(cueSheet.state.shown.sheet).toEqual(CELLS);
    expect(() => {
      cueSheet.rename(1, 'X');
      cueSheet.save();
    }).not.toThrow();
    expect(cueSheet.state.shown.sheet).toEqual([CELLS[0], set(CELLS[1], 'label', 'X'), ...CELLS.slice(2)]);
  });
});

/** The pane cell of `_cueSheet`'s shown document labelled `_label`, in `_group`. */
const paneCell = (_cueSheet: CueSheet, _group: keyof CueSheet['state']['shown']['pane'], _label: string) =>
  filter(_cueSheet.state.shown.pane[_group], (_cell) => _cell.label === _label)[0];

describe('cueSheet key assignment', () => {
  it('links the key selected under Assign to a pane light, which then toggles that colour and the previous one', () => {
    const { cueSheet, sent, confirm } = setup();
    cueSheet.choose('Assign');
    cueSheet.press('b');
    cueSheet.use(paneCell(cueSheet, 'lights', 'red'));
    expect([sent(), cueSheet.state.key]).toEqual([[], 'b']);
    cueSheet.save();
    cueSheet.press('b');
    confirm();
    cueSheet.press('b');
    expect(sent()).toEqual(asSent(setting({ name: 'headlight', value: 'red' }), setting({ name: 'headlight', value: 'green' })));
  });

  it('marks as target only the cell the selected key is linked to, and nothing for an unassigned key', () => {
    const { cueSheet } = setup();
    const cells = [...cueSheet.state.shown.sheet, ...pipe(cueSheet.state.shown.pane, values(), flat())];
    const targets = () => map(filter(cells, cueSheet.isTarget), (_cell) => _cell.label);
    cueSheet.choose('Assign');
    expect(targets()).toEqual([]);
    cueSheet.press('x');
    expect(targets()).toEqual(['Sitting']);
    cueSheet.press('y');
    expect(targets()).toEqual([]);
  });

  it('records the pane light a held key is linked to as pressed', () => {
    const { cueSheet } = setup();
    const red = paneCell(cueSheet, 'lights', 'red');
    cueSheet.choose('Assign');
    cueSheet.press('b');
    cueSheet.use(red);
    cueSheet.save();
    cueSheet.press('b');
    expect(cueSheet.isPressed(red)).toBe(true);
  });

  it('greys and ignores the pane buttons while no robot is connected, except for a click under Assign', () => {
    const { cueSheet, sent } = setup(CONDUITE, memoryStorage(), false);
    const red = paneCell(cueSheet, 'lights', 'red');
    cueSheet.use(red);
    cueSheet.press('a');
    expect([sent(), cueSheet.usable(red)]).toEqual([[], false]);
    cueSheet.choose('Assign');
    expect(cueSheet.usable(red)).toBe(true);
  });

  it('makes usable and sends only the side of a posture pair the settled posture allows', () => {
    const { cueSheet, sent, confirm } = setup();
    const usableSides = () =>
      pipe(
        keys(POSTURES),
        flatMap((_posture) => filter([enter(_posture), leave(_posture)], (_side) => cueSheet.usable(paneCell(cueSheet, 'postures', _posture), _side))),
        map(prop('label')),
      );
    const sitting = paneCell(cueSheet, 'postures', 'Sitting');
    expect(usableSides()).toEqual(keys(POSTURES));
    cueSheet.use(sitting, leave('Sitting'));
    cueSheet.use(sitting, enter('Sitting'));
    confirm();
    expect(usableSides()).toEqual([leave('Sitting').label]);
    cueSheet.use(paneCell(cueSheet, 'postures', 'Pose'), enter('Pose'));
    cueSheet.use(sitting, leave('Sitting'));
    expect(sent()).toEqual(asSent(enter('Sitting'), leave('Sitting')));
  });

  it('draws pressed and sends only the side of the posture pair a key is linked to that the settled posture allows', () => {
    const { cueSheet, sent, confirm } = setup(CONDUITE);
    const pose = paneCell(cueSheet, 'postures', 'Pose');
    const pressedSides = () => filter([enter('Pose'), leave('Pose')], (_side) => cueSheet.isPressed(pose, _side));
    cueSheet.press('a');
    // The robot settles in Pose while a is held; the side drawn pressed stays the one a sent.
    confirm();
    expect(pressedSides()).toEqual([enter('Pose')]);
    cueSheet.release('a');
    cueSheet.press('a');
    expect(pressedSides()).toEqual([leave('Pose')]);
    expect(sent()).toEqual(asSent(enter('Pose'), leave('Pose')));
  });

  it('draws nothing pressed and sends nothing for a key linked to a posture pair while the robot is in another posture', () => {
    const { cueSheet, sent, confirm } = setup(CONDUITE);
    tap(cueSheet, 'x');
    confirm();
    cueSheet.press('a');
    expect([sent(), cueSheet.state.pressed]).toEqual([asSent(enter('Sitting')), null]);
  });

  it('links a key to the sheet cell a sweep ends on, and unassigns it when Ungroup removes that cell', () => {
    const { cueSheet } = editing('Assign');
    cueSheet.press('y');
    cueSheet.sweep(0, 2);
    expect(cueSheet.linked('y')).toEqual(CELLS[2]);
    cueSheet.choose('Ungroup');
    cueSheet.sweep(2, 2);
    expect(cueSheet.linked('y')).toBeUndefined();
  });

  it('unassigns a key linked to a cell Group folds into a group, and keeps the other links', () => {
    const { cueSheet } = editing('Assign');
    cueSheet.press('a');
    cueSheet.sweep(3, 3);
    const before = cueSheet.state.shown.bindings;
    cueSheet.choose('Group');
    cueSheet.sweep(3, 4);
    expect(cueSheet.state.shown.bindings).toEqual(omit(before, ['a']));
  });

  it('keeps a saved link across a reload, and discards an unsaved one on Cancel', () => {
    const storage = memoryStorage();
    const { cueSheet } = editing('Assign', 0, SHEET, storage);
    cueSheet.press('b');
    cueSheet.sweep(0, 0);
    cueSheet.save();
    expect(setup(SHEET, storage).cueSheet.linked('b')).toEqual(CELLS[0]);
    cueSheet.choose('Assign');
    cueSheet.press('b');
    cueSheet.sweep(1, 1);
    cueSheet.cancel();
    expect([cueSheet.linked('b'), cueSheet.state.key]).toEqual([CELLS[0], null]);
  });

  it('drops a stored link to an identifier no drawn cell holds', () => {
    const { cueSheet } = setup(SHEET);
    const { sheet, pane } = cueSheet.state.shown;
    const document = { sheet, pane, bindings: { a: 999, b: 0, x: 3 } };
    const reloaded = setup(SHEET, memoryStorage(new Map([['cueSheet.v2', JSON.stringify(document)]]))).cueSheet;
    expect(reloaded.state.saved.bindings).toEqual({ b: 0 });
  });
});

describe('cueSheet import and export', () => {
  /** The JSON text of a file holding `_sheet` as its stored cells, and the pane of `_cueSheet`. */
  const file = (_cueSheet: CueSheet, _sheet: unknown[]) =>
    JSON.stringify({ version: 2, sheet: _sheet, pane: _cueSheet.state.shown.pane, bindings: {} });

  /** One stored leaf, numbered above every identifier of the default document. */
  const ONE = { id: 1000, label: 'Sit', name: 'enter', args: ['Sitting'] };

  it('writes the version, and shows an equal document on importing its own export, under the same instrument', () => {
    const { cueSheet } = editing('Group');
    cueSheet.sweep(0, 1);
    const shown = cueSheet.state.shown;
    cueSheet.import(cueSheet.exported());
    expect(JSON.parse(cueSheet.exported()).version).toBe(2);
    expect([cueSheet.state.shown, cueSheet.state.instrument]).toEqual([shown, 'Group']);
  });

  it('exports the same text again after importing its own export', () => {
    const { cueSheet } = editing('Group');
    cueSheet.sweep(0, 1);
    const text = cueSheet.exported();
    cueSheet.import(text);
    expect(cueSheet.exported()).toBe(text);
  });

  it.each([
    ['an invalid leaf', (_cueSheet: CueSheet) => file(_cueSheet, [set(ONE, 'args', ['Stairs'])]), /→ at sheet\.0\.args\.0$/],
    ['a wrong version', (_cueSheet: CueSheet) => file(_cueSheet, [ONE]).replace('"version":2', '"version":3'), /→ at version$/],
    ['text that is not JSON', () => 'not json', /JSON/],
  ])('keeps the shown document on %s, and reports the first issue until the next action', (_name, _text, _message) => {
    const { cueSheet } = editing('Move');
    const shown = cueSheet.state.shown;
    cueSheet.import(_text(cueSheet));
    expect(cueSheet.state.shown).toBe(shown);
    expect(cueSheet.state.problem).toMatch(_message);
    cueSheet.sweep(0, 0);
    expect(cueSheet.state.problem).toBeNull();
  });

  it('restores the saved document on Cancel after an import', () => {
    const { cueSheet } = editing('Move');
    const saved = cueSheet.state.saved;
    cueSheet.import(file(cueSheet, [ONE]));
    expect(cueSheet.state.shown.sheet).toHaveLength(1);
    cueSheet.cancel();
    expect(cueSheet.state.shown).toBe(saved);
  });

  it('stores an imported document on Save', () => {
    const storage = memoryStorage();
    const { cueSheet } = editing('Move', 0, SHEET, storage);
    cueSheet.import(file(cueSheet, [ONE]));
    cueSheet.save();
    expect(map(setup(SHEET, storage).cueSheet.state.shown.sheet, prop('label'))).toEqual(['Sit']);
  });
});
