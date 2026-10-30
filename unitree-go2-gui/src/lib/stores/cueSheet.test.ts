import { describe, it, expect } from 'vitest';
import { evolve, filter, flat, flatMap, forEach, keys, map, merge, omit, pick, pipe, prop, set, splice, times, values } from 'remeda';
import * as v from 'valibot';
import { CONDUITE, presets } from '../data/cues';
import { POSTURES, compiled, enter, leave, perform, sequence, set as setting, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { distinct, nextId, numbered, opened } from '../utils/trees';
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
 * as `asSent` shows it; `receive` delivers a message from the relay; `log` is the robot's log. */
const setup = (_cues = CUES, _storage: Pick<Storage, 'getItem' | 'setItem'> = memoryStorage(), _connected = true) => {
  const frames: string[] = [];
  const send = (_frame: string) => void frames.push(_frame);
  const socket = { readyState: 1, send, onopen: null, onclose: null, onmessage: null as ((_event: { data: string }) => void) | null };
  const log = new OutcomeLog();
  const robot = new Robot({ openSocket: () => socket, outcomeLog: log });
  robot.connect();
  const receive = (_message: object) => socket.onmessage?.({ data: JSON.stringify(_message) });
  forEach(_connected ? [{ type: 'robot_state', connected: true }, { type: 'sport_state', motionMode: 'mcf', errorCode: 0 }] : [], receive);
  const cueSheet = new CueSheet(_cues, robot, _storage);
  const sent = () => map(frames, (_frame) => pick(JSON.parse(_frame), ['command_name', 'sequence']));
  /** Confirms the latest request, as the relay would. */
  const confirm = () =>
    socket.onmessage?.({
      data: JSON.stringify({ type: 'command_result', reqId: JSON.parse(frames[frames.length - 1]).reqId, outcome: 'confirmed', code: 0, detail: null, command_name: null }),
    });
  return { cueSheet, robot, sent, confirm, receive, log };
};

/** The request a cue labelled `_label` makes when it sets the speed to `_level`, as `sent` reads it. */
const speedSent = (_label: string, _level: number) => ({
  command_name: _label,
  sequence: [{ kind: 'command', topic: 'SPORT_MOD', api_id: 1015, command_name: 'SpeedLevel', parameter: { data: _level } }],
});

/** The summaries of the presses `_log` holds as blocked, newest first. */
const blocked = (_log: OutcomeLog) => map(_log.messages.blocked, prop('summary'));

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
    expect(sheets(cueSheet)).toEqual({ saved: cells, shown: cells, pointer: 0, pressed: null, instrument: 'Fire', renaming: null, deleting: null, key: null, carried: null, problem: null });
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

  it('sends nothing for a toggle whose fields wait for a verdict, logs it as blocked, and still sends a sheet cell', () => {
    const { cueSheet, robot, sent, log } = setup(CONDUITE);
    cueSheet.press('a');
    expect(robot.current.state.pending.posture).toBeDefined();
    // Pose, Sit and Bound all toggle the posture, which waits.
    cueSheet.press('a');
    cueSheet.press('x');
    cueSheet.press('b');
    cueSheet.press('y');
    expect(sent()).toEqual(asSent(ENTER_POSE, presets.dance));
    expect(blocked(log)).toEqual(
      map(['Bound', 'Sit', 'Enter Pose'], (_label) => `${_label}: waiting for the verdict on the posture`),
    );
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

/** The wait cell of `_seconds` a Pause sweep on `_cueSheet` inserts: numbered above every shown cell. */
const pauseCell = (_cueSheet: CueSheet, _seconds: number) =>
  numbered([wait(_seconds)], nextId([..._cueSheet.state.shown.sheet, ...pipe(_cueSheet.state.shown.pane, values(), flat())]))[0];

describe('cueSheet pauses', () => {
  it.each([
    [false, 1],
    [true, 2],
  ])('inserts a wait cell, with after %s on cell 1, at index %i, and keeps every other cell', (_after, _index) => {
    const { cueSheet, state } = editing('Pause');
    const expected = pauseCell(cueSheet, 0.1);
    cueSheet.sweep(1, 1, { after: _after, travel: 0, drag: 0 });
    expect(state().shown.sheet[_index]).toEqual(expected);
    expect(filter(state().shown.sheet, (_cell) => _cell !== state().shown.sheet[_index])).toEqual(CELLS);
  });

  it.each([
    [0, 0.1],
    [0.5, 2.6],
    [1, 5],
  ])('waits, for a travel of %f, %f seconds', (_travel, _seconds) => {
    const { cueSheet, state } = editing('Pause');
    const expected = pauseCell(cueSheet, _seconds);
    cueSheet.sweep(1, 1, { after: false, travel: _travel, drag: 0 });
    expect(state().shown.sheet[1]).toEqual(expected);
  });

  it('inserts, without a press, a 0.1 s wait before the cell', () => {
    const { cueSheet, state } = editing('Pause');
    const expected = pauseCell(cueSheet, 0.1);
    cueSheet.sweep(1, 1);
    expect(state().shown.sheet[1]).toEqual(expected);
  });

  it('gives the wait cell an identifier no other cell of the sheet or the pane holds', () => {
    const { cueSheet, state } = editing('Pause');
    cueSheet.sweep(1, 1, { after: true, travel: 0.5, drag: 0 });
    expect(v.safeParse(documentSchema, state().shown).success).toBe(true);
  });

  it.each([false, true])('previews, with after %s, the sheet its release leaves, and highlights only the wait cell', (_after) => {
    const { cueSheet, state } = editing('Pause');
    const press = { after: _after, travel: 0.5, drag: 0 };
    const preview = cueSheet.instruments.Pause.shown(1, 3, press)(state().shown.sheet);
    const swept = cueSheet.instruments.Pause.swept(1, 3, press);
    cueSheet.sweep(1, 3, press);
    expect(preview).toEqual(state().shown.sheet);
    expect(swept).toEqual([_after ? 2 : 1]);
    expect(preview[_after ? 2 : 1]).toMatchObject({ name: 'wait', args: [2.6] });
  });

  it.each([
    ['before the cell', 0, 0],
    ['on the cell', 1, 1],
    ['after the cell', 4, 5],
  ])('moves the pointer %s on a Pause of cell 1', (_where, _pointer, _after) => {
    const { cueSheet, state } = editing('Pause', _pointer);
    cueSheet.sweep(1, 1, { after: true, travel: 0, drag: 0 });
    expect(state().pointer).toBe(_after);
  });

  it('keeps the cell of a pointer after the pressed cell', () => {
    const { cueSheet, state } = editing('Pause', 4);
    cueSheet.sweep(1, 1, { after: false, travel: 0, drag: 0 });
    expect(state().shown.sheet[state().pointer]).toEqual(CELLS[4]);
  });
});

/** A Pause press on the upper half of a cell, moved horizontally by `_drag` strip widths. */
const dragged = (_drag: number) => ({ after: false, travel: 0, drag: _drag });

describe('cueSheet retimes a wait cell under Pause', () => {
  it('leaves the sheet unchanged on a press with no horizontal movement, even on a wait above 5 s', () => {
    const { cueSheet, state } = editing('Pause', 0, [enter('FreeWalk'), wait(7)]);
    const before = state().shown.sheet;
    cueSheet.sweep(1, 1, { after: true, travel: 0.5, drag: 0 });
    expect(state().shown.sheet).toEqual(before);
  });

  it.each([
    ['a quarter strip width right', 0.25, 2.2],
    ['left past the start', -1, 0.1],
    ['right far enough', 2, 5],
  ])('gives the 1 s wait of cell 4, for a drag %s, %f seconds, under its own identifier', (_where, _drag, _seconds) => {
    const { cueSheet, state } = editing('Pause');
    cueSheet.sweep(4, 4, dragged(_drag));
    expect(state().shown.sheet).toEqual(splice(CELLS, 4, 1, numbered([wait(_seconds)], CELLS[4].id)));
  });

  it('keeps the key linked to the retimed wait cell', () => {
    const { cueSheet } = editing('Assign');
    cueSheet.press('a');
    cueSheet.sweep(4, 4);
    cueSheet.choose('Pause');
    cueSheet.sweep(4, 4, dragged(0.25));
    expect(cueSheet.linked('a')).toMatchObject({ id: CELLS[4].id, name: 'wait', args: [2.2] });
  });

  it('previews the sheet its release leaves, and highlights only the wait cell', () => {
    const { cueSheet, state } = editing('Pause');
    const preview = cueSheet.instruments.Pause.shown(4, 2, dragged(0.25))(state().shown.sheet);
    const swept = cueSheet.instruments.Pause.swept(4, 2, dragged(0.25));
    cueSheet.sweep(4, 2, dragged(0.25));
    expect([preview, swept]).toEqual([state().shown.sheet, [4]]);
  });

  it('inserts a wait next to a group of waits, which is not a wait cell', () => {
    const { cueSheet, state } = editing('Pause', 0, [enter('FreeWalk'), sequence('rest', wait(1), wait(2))]);
    const expected = pauseCell(cueSheet, 0.1);
    cueSheet.sweep(1, 1, dragged(0.25));
    expect(state().shown.sheet[1]).toEqual(expected);
    expect(state().shown.sheet).toHaveLength(3);
  });
});

describe('cueSheet deletions', () => {
  it('deletes nothing on a Delete release, in either direction, and holds the swept range for confirmation', () => {
    times(2, (_reverse) => {
      const { cueSheet } = editing('Delete');
      cueSheet.sweep(_reverse ? 3 : 1, _reverse ? 1 : 3);
      expect(sheets(cueSheet)).toMatchObject({ shown: CELLS, deleting: [1, 3] });
    });
  });

  it('deletes exactly the range on confirmDelete, and ends the confirmation', () => {
    const { cueSheet } = editing('Delete');
    cueSheet.sweep(1, 3);
    cueSheet.confirmDelete();
    expect(sheets(cueSheet)).toMatchObject({ shown: [CELLS[0], CELLS[4], CELLS[5]], deleting: null });
  });

  it.each([
    ['cancelDelete', (_cueSheet: CueSheet) => _cueSheet.cancelDelete()],
    ['a change of instrument', (_cueSheet: CueSheet) => _cueSheet.choose('Move')],
    ['another edit', (_cueSheet: CueSheet) => _cueSheet.reorder(4, 5)],
    ['Reset', (_cueSheet: CueSheet) => _cueSheet.reset()],
    ['Save', (_cueSheet: CueSheet) => _cueSheet.save()],
    ['Cancel', (_cueSheet: CueSheet) => _cueSheet.cancel()],
  ])('keeps the swept cells after %s, and ends the confirmation', (_name, _act) => {
    const { cueSheet, state } = editing('Delete');
    cueSheet.sweep(1, 3);
    _act(cueSheet);
    const kept = state().shown.sheet;
    cueSheet.confirmDelete();
    expect(state()).toMatchObject({ shown: { sheet: kept }, deleting: null });
    expect(kept).toEqual(expect.arrayContaining(CELLS.slice(1, 4)));
  });

  it('unassigns a key linked to a deleted cell, and keeps the other links', () => {
    const { cueSheet } = editing('Assign');
    cueSheet.press('a');
    cueSheet.sweep(3, 3);
    cueSheet.press('b');
    cueSheet.sweep(0, 0);
    cueSheet.choose('Delete');
    cueSheet.sweep(2, 3);
    cueSheet.confirmDelete();
    expect([cueSheet.linked('a'), cueSheet.linked('b')]).toEqual([undefined, CELLS[0]]);
  });

  it.each([
    ['before the range', 1, 1],
    ['on the range', 4, 3],
    ['on the last cell', 5, 3],
  ])('moves a pointer %s onto its own cell or the new last cell when the last cells are deleted', (_where, _pointer, _after) => {
    const { cueSheet, state } = editing('Delete', _pointer);
    cueSheet.sweep(4, 5);
    cueSheet.confirmDelete();
    expect(state().pointer).toBe(_after);
    expect(state().shown.sheet[state().pointer]).toEqual(CELLS[_after]);
  });

  it('leaves the sheet unchanged, and Confirm refused, when the range is every cell', () => {
    const { cueSheet, state } = editing('Delete');
    expect(cueSheet.deletesAll()).toBe(false);
    cueSheet.sweep(SHEET.length - 1, 0);
    expect(cueSheet.deletesAll()).toBe(true);
    cueSheet.confirmDelete();
    expect(state().shown.sheet).toEqual(CELLS);
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
    expect(sheets(cueSheet)).toEqual({ saved: cells, shown: cells, pointer: 1, pressed: null, instrument: 'Fire', renaming: null, deleting: null, key: null, carried: null, problem: null });
    cueSheet.sweep(1, 1);
    expect(sent()).toEqual(asSent(CELLS[0], renamed));
  });

  it('restores the saved cells on Cancel, returns to Fire, and keeps the pointer index, clamped to the saved length', () => {
    const { cueSheet, state } = editing('Group', 4);
    cueSheet.sweep(0, 3);
    expect(state().pointer).toBe(1);
    cueSheet.cancel();
    expect(sheets(cueSheet)).toEqual({ saved: CELLS, shown: CELLS, pointer: 1, pressed: null, instrument: 'Fire', renaming: null, deleting: null, key: null, carried: null, problem: null });

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
    expect(sheets(cueSheet)).toEqual({ saved: CELLS, shown: CELLS, pointer: SHEET.length - 1, pressed: null, instrument: 'Rename', renaming: null, deleting: null, key: null, carried: null, problem: null });
  });
});

/** The document of a cue sheet on `SHEET` and the default pane, with its first cell renamed so that
 * it differs from the default one, and the document a second cue sheet loads once the first is
 * stored without the pane groups `_missing`. */
const reloadedWithout = (..._missing: (keyof CueSheet['state']['shown']['pane'])[]) => {
  const { cueSheet } = editing('Rename', 0, SHEET);
  cueSheet.rename(0, 'Stored');
  const document = cueSheet.state.shown;
  const stored = JSON.stringify({ version: 2, sheet: document.sheet, pane: omit(document.pane, _missing), bindings: document.bindings });
  return { document, reloaded: setup(SHEET, memoryStorage(new Map([['cueSheet.v2', stored]]))).cueSheet.state.shown };
};

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

  it('lists the speeds last in the default pane', () => {
    expect(keys(setup().cueSheet.state.shown.pane)).toEqual(['actions', 'gaits', 'postures', 'lights', 'speeds']);
  });

  it('loads a stored document without speeds with the three speed cells numbered above every other cell, the rest unchanged', () => {
    const { document, reloaded } = reloadedWithout('speeds');
    const others = [...reloaded.sheet, ...pipe(omit(reloaded.pane, ['speeds']), values(), flat())];
    expect(omit(reloaded, ['pane'])).toEqual(omit(document, ['pane']));
    expect(omit(reloaded.pane, ['speeds'])).toEqual(omit(document.pane, ['speeds']));
    expect(map(reloaded.pane.speeds, prop('label'))).toEqual(['slow', 'normal', 'fast']);
    expect(map(reloaded.pane.speeds, prop('id'))).toEqual(times(3, (_index) => nextId(others) + _index));
    expect(keys(reloaded.pane)).toEqual(keys(document.pane));
    expect(distinct([...reloaded.sheet, ...pipe(reloaded.pane, values(), flat())])).toBe(true);
  });

  it('loads a stored document missing two pane groups with both filled, every identifier distinct', () => {
    const { reloaded } = reloadedWithout('lights', 'speeds');
    expect(reloaded.sheet[0].label).toBe('Stored');
    expect(map(reloaded.pane.lights, prop('label'))).toEqual(['white', 'red', 'yellow', 'blue', 'green', 'cyan', 'purple']);
    expect(map(reloaded.pane.speeds, prop('label'))).toEqual(['slow', 'normal', 'fast']);
    expect(distinct([...reloaded.sheet, ...pipe(reloaded.pane, values(), flat())])).toBe(true);
  });
});

/** The pane cell of `_cueSheet`'s shown document labelled `_label`, in `_group`. */
const paneCell = (_cueSheet: CueSheet, _group: keyof CueSheet['state']['shown']['pane'], _label: string) =>
  filter(_cueSheet.state.shown.pane[_group], (_cell) => _cell.label === _label)[0];

describe('cueSheet copies a held pane command', () => {
  it.each([
    ['before the first cell', 0],
    ['after the last cell', SHEET.length],
  ])('inserts the carried "red" light %s under Move, and leaves the pane unchanged', (_where, _at) => {
    const { cueSheet, state } = editing('Move');
    const { pane } = state().shown;
    const red = paneCell(cueSheet, 'lights', 'red');
    cueSheet.carry(red);
    cueSheet.sweep(_at, _at);
    expect(map(state().shown.sheet, prop('label'))).toEqual(splice(map(SHEET, prop('label')), _at, 0, ['red']));
    expect(omit(state().shown.sheet[_at], ['id'])).toEqual(omit(red, ['id']));
    expect(state().shown.pane).toEqual(pane);
  });

  it('inserts the exit side of the Sitting pair when that side is carried', () => {
    const { cueSheet, state } = editing('Move');
    cueSheet.carry(paneCell(cueSheet, 'postures', 'Sitting'), leave('Sitting'));
    cueSheet.sweep(1, 1);
    expect(omit(state().shown.sheet[1], ['id'])).toEqual(leave('Sitting'));
    expect(state().shown.sheet[1].label).toBe('Exit Sitting');
  });

  it('gives a copied group cell and its constituents identifiers no other cell holds', () => {
    const { cueSheet, state } = editing('Move');
    cueSheet.carry(state().shown.sheet[2]);
    cueSheet.sweep(0, 0);
    expect(map(opened(state().shown.sheet[0]), prop('label'))).toEqual(map(opened(SABOTS), prop('label')));
    expect(distinct([...state().shown.sheet, ...pipe(state().shown.pane, values(), flat())])).toBe(true);
  });

  it('previews a copy as its release will leave the cells, and highlights only the copy', () => {
    const { cueSheet, state } = editing('Move');
    cueSheet.carry(paneCell(cueSheet, 'lights', 'red'));
    const preview = cueSheet.instruments.Copy.shown(0, 3)(state().shown.sheet);
    expect(cueSheet.instruments.Copy.swept(0, 3)).toEqual([3]);
    cueSheet.sweep(0, 3);
    expect(preview).toEqual(state().shown.sheet);
  });

  it.each(['Fire', 'Pause', 'Assign'] as const)('holds nothing under %s, which a sweep then uses', (_name) => {
    const { cueSheet, state } = editing(_name);
    cueSheet.carry(paneCell(cueSheet, 'lights', 'red'));
    expect([state().carried, cueSheet.inUse()]).toEqual([null, _name]);
  });

  it('reorders again as Move does once the command is dropped', () => {
    const { cueSheet, state } = editing('Move');
    cueSheet.carry(paneCell(cueSheet, 'lights', 'red'));
    cueSheet.drop();
    cueSheet.sweep(1, 4);
    expect(state().shown.sheet).toEqual(map([0, 2, 3, 4, 1, 5], (_index) => CELLS[_index]));
  });
});

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

  it('makes usable and sends only the sides of a posture pair the settled posture allows, and both sides of Damp', () => {
    const { cueSheet, sent, confirm } = setup();
    const usableSides = () =>
      pipe(
        keys(POSTURES),
        flatMap((_posture) => filter([enter(_posture), leave(_posture)], (_side) => cueSheet.usable(paneCell(cueSheet, 'postures', _posture), _side))),
        map(prop('label')),
      );
    const sitting = paneCell(cueSheet, 'postures', 'Sitting');
    expect(usableSides()).toEqual([...keys(POSTURES), leave('Damp').label]);
    cueSheet.use(sitting, leave('Sitting'));
    cueSheet.use(sitting, enter('Sitting'));
    confirm();
    expect(usableSides()).toEqual(map([leave('Sitting'), enter('Damp'), leave('Damp')], prop('label')));
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

  it('logs a pane button pressed while the robot is disconnected as blocked, with the reason', () => {
    const { cueSheet, log } = setup(CONDUITE, memoryStorage(), false);
    cueSheet.use(paneCell(cueSheet, 'lights', 'red'));
    expect(blocked(log)).toEqual(['red: the robot is not connected']);
  });

  it('logs a gait pressed before any gait or posture report as blocked, with the reason', () => {
    const { cueSheet, sent, receive, log } = setup(CONDUITE, memoryStorage(), false);
    receive({ type: 'robot_state', connected: true });
    cueSheet.use(paneCell(cueSheet, 'gaits', 'Bound'));
    expect([sent(), blocked(log)]).toEqual([[], ['Bound: the robot has not reported its gait or posture']]);
  });

  it('makes both sides of Damp usable before any gait or posture report, and sends them', () => {
    const { cueSheet, sent, receive } = setup(CONDUITE, memoryStorage(), false);
    receive({ type: 'robot_state', connected: true });
    const damp = paneCell(cueSheet, 'postures', 'Damp');
    expect([cueSheet.usable(damp, enter('Damp')), cueSheet.usable(damp, leave('Damp'))]).toEqual([true, true]);
    cueSheet.use(damp, leave('Damp'));
    expect(sent()).toEqual(asSent(leave('Damp')));
  });

  it('sends SpeedLevel for a pane speed once the robot has reported its speed, and logs it as blocked before', () => {
    const { cueSheet, sent, receive, log } = setup(CONDUITE);
    const fast = paneCell(cueSheet, 'speeds', 'fast');
    cueSheet.use(fast);
    expect([sent(), blocked(log)]).toEqual([[], ['fast: the robot has not reported its speed']]);
    receive({ type: 'robot_settings', speedLevel: 0, obstacleAvoidance: false });
    cueSheet.use(fast);
    expect(sent()).toEqual([speedSent('fast', 1)]);
  });

  it('links the key selected under Assign to a pane speed, which then sends that speed under Fire', () => {
    const { cueSheet, sent, receive } = setup(CONDUITE);
    receive({ type: 'robot_settings', speedLevel: 0, obstacleAvoidance: false });
    cueSheet.choose('Assign');
    cueSheet.press('b');
    cueSheet.use(paneCell(cueSheet, 'speeds', 'slow'));
    cueSheet.save();
    cueSheet.press('b');
    expect(sent()).toEqual([speedSent('slow', -1)]);
  });

  it('logs the side of a posture pair the settled posture does not allow as blocked, from a button and from a key', () => {
    const { cueSheet, confirm, log } = setup(CONDUITE);
    cueSheet.use(paneCell(cueSheet, 'postures', 'Sitting'), leave('Sitting'));
    tap(cueSheet, 'x');
    confirm();
    cueSheet.press('a');
    expect(blocked(log)).toEqual(map(['Enter Pose', 'Rise'], (_label) => `${_label}: the robot's posture does not allow it`));
  });

  it('logs an unassigned key under Fire as blocked, and nothing for a key that is not a face key', () => {
    const { cueSheet, log } = setup();
    tap(cueSheet, 'y');
    tap(cueSheet, 'z');
    expect(blocked(log)).toEqual(['y: no cell is linked to this key']);
  });

  it('draws a key\'s cell pressed while the robot cannot take it, and logs the press as blocked', () => {
    const { cueSheet, sent, log } = setup(CONDUITE, memoryStorage(), false);
    cueSheet.press('b');
    expect([sent(), cueSheet.state.pressed?.id, blocked(log)]).toEqual([[], cueSheet.linked('b')?.id, ['Bound: the robot is not connected']]);
  });

  it('logs no blocked entry for a press that is sent', () => {
    const { cueSheet, sent, log } = setup(CONDUITE);
    cueSheet.use(paneCell(cueSheet, 'lights', 'red'));
    tap(cueSheet, 'y');
    expect([sent().length, blocked(log)]).toEqual([2, []]);
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
