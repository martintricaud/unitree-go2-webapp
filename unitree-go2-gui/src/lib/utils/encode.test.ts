import { describe, it, expect } from 'vitest';
import { drop, fromKeys, keys, map, mapValues, merge } from 'remeda';
import * as v from 'valibot';
import { CONDUITE, presets } from '../data/cues';
import { COLOURS, SPEED_LEVELS } from '../data/settings';
import { ACTIONS, GAITS, dim, enter, isCommandable, leave, orient, perform, recover, sequence, set, wait } from './commands';
import { cells as numbered, compiled, sheetSchema } from './commands';
import type { Cell } from './commands';
import { nextId } from './trees';
import WIRE from './encode.fixture.json';

const COMMANDABLE_GAITS = keys(GAITS).filter(isCommandable);

/** A message as the fixture records it: a command, a wait, or a sequence of messages. */
type Recorded = { kind: string; sequence?: Recorded[] };

/** The commands and waits a recorded message sends, in order. */
const flattened = (_message: Recorded): Recorded[] => _message.sequence?.flatMap(flattened) ?? [_message];

// The fixture holds what the browser sent while a sequence could hold further sequences.
describe('steps', () => {
  it('sends every cue of the cue sheet as before', () => {
    expect(CONDUITE.map((_cue) => compiled(_cue).steps)).toEqual(WIRE.conduite.map(flattened));
  });

  it('sends every preset as before', () => {
    expect(mapValues(WIRE.presets, (_wire, _name) => compiled(presets[_name]).steps)).toEqual(mapValues(WIRE.presets, flattened));
  });

  it('sends every mode, action, colour, speed and obstacle-avoidance control as before', () => {
    expect({
      ...fromKeys(COMMANDABLE_GAITS, (_gait) => compiled(enter(_gait)).steps),
      Damp: compiled(enter('Damp')).steps,
      Pose: compiled(enter('Pose')).steps,
    }).toEqual(mapValues(WIRE.modesOn, flattened));
    expect({
      ...fromKeys(ACTIONS, (_action) => compiled(perform(_action)).steps),
      Sit: compiled(enter('Sitting')).steps,
      RiseSit: compiled(leave('Sitting')).steps,
      StandDown: compiled(enter('Lying')).steps,
      StandUp: compiled(enter('JointLock')).steps,
      BalanceStand: compiled(leave('JointLock')).steps,
      RecoveryStand: compiled(recover()).steps,
    }).toEqual(mapValues(WIRE.actions, flattened));
    expect(mapValues(WIRE.headlight, (_wire, _colour) => compiled(set({ name: 'headlight', value: _colour })).steps)).toEqual(
      mapValues(WIRE.headlight, flattened),
    );
    expect(mapValues(SPEED_LEVELS, (_level) => compiled(set({ name: 'speed', value: _level })).steps)).toEqual(
      mapValues(WIRE.speed, flattened),
    );
    expect({
      on: compiled(set({ name: 'obstacleAvoidance', value: true })).steps,
      off: compiled(set({ name: 'obstacleAvoidance', value: false })).steps,
    }).toEqual(mapValues(WIRE.obstacleAvoidance, flattened));
  });

  it('sends the white headlight as a Headlight colour, no longer as a Brightness', () => {
    expect(COLOURS).toContain('white');
    expect(compiled(set({ name: 'headlight', value: 'white' })).steps).toEqual([{ ...WIRE.headlight.red, parameter: { color: 'white' } }]);
  });

  it('sends a gait as its request with the flag on', () => {
    COMMANDABLE_GAITS.forEach((_gait) => {
      expect(compiled(enter(_gait)).steps).toMatchObject([{ parameter: { data: true } }]);
    });
  });

  it("sends a posture's several steps in a row, and splices them into a named sequence", () => {
    expect(compiled(leave('Lying')).steps).toEqual([...compiled(enter('JointLock')).steps, ...compiled(leave('JointLock')).steps]);
    expect(compiled(sequence('Named', enter('Pose'))).steps).toEqual([
      ...compiled(perform('StopMove')).steps,
      { kind: 'command', topic: 'SPORT_MOD', api_id: 1028, command_name: 'Pose', parameter: { data: true } },
    ]);
    expect(compiled(leave('Pose')).steps).toEqual([
      { kind: 'command', topic: 'SPORT_MOD', api_id: 1028, command_name: 'Pose', parameter: { data: false } },
    ]);
  });
});

describe('label', () => {
  it('names each cue as the cue sheet and the outcome log show it', () => {
    expect(
      [
        enter('Bound'),
        enter('Pose'),
        leave('Lying'),
        perform('Hello'),
        recover(),
        set({ name: 'headlight', value: 'red' }),
        set({ name: 'speed', value: 1 }),
        orient(0, -1, 0),
        dim(4),
        wait(0.5),
        sequence('Named', perform('Hello')),
        sequence('', perform('Hello')),
      ].map((_cue) => _cue.label),
    ).toEqual([
      'Bound',
      'Pose',
      'Exit Lying',
      'Hello',
      'RecoveryStand',
      'Headlight',
      'SpeedLevel',
      'Euler',
      'Brightness',
      '⏱ 0.5s',
      'Named',
      'unnamed sequence',
    ]);
  });

  it('names the cue sheet as before, in the same order', () => {
    expect(CONDUITE.map((_cue) => _cue.label)).toEqual([
      'FreeWalk',
      'Pose',
      'Sabots',
      'Wizard of Oz',
      'Stretch 👋 Jump',
      'Content',
      'Picture me...',
      'Handstand',
      'ClassicWalk',
      'Heart',
      'Salto',
      'Sitting',
      'FreeWalk',
      'Chien',
      'FreeWalk',
      'Dance',
      'Ahahah Redlight',
      'Assis Whitelight',
      'Lying',
    ]);
  });
});

describe('changes', () => {
  it('lists the fields each cue changes, a sequence its items\' changes in order', () => {
    expect(compiled(enter('Bound')).change).toEqual({ gait: 'Bound', posture: null });
    expect(compiled(enter('Pose')).change).toEqual({ posture: 'Pose' });
    expect(compiled(leave('Pose')).change).toEqual({ posture: null });
    expect(compiled(recover()).change).toEqual({ posture: null });
    expect(compiled(set({ name: 'headlight', value: 'red' })).change).toEqual({ headlight: 'red' });
    [perform('Hello'), orient(0, -1, 0), dim(4), wait(1)].forEach((_cue) => {
      expect(compiled(_cue).change).toEqual({});
    });
    expect(compiled(sequence('', enter('Running'), wait(1), enter('Sitting'))).change).toEqual({ gait: 'Running', posture: 'Sitting' });
  });
});

describe('tree', () => {
  it('keeps the cues a sequence was built from, in order', () => {
    expect(sequence('Named', enter('Pose'), wait(1)).items).toEqual([enter('Pose'), wait(1)]);
  });

  it('has no items for a cue not built by sequence', () => {
    [
      enter('Bound'),
      enter('Pose'),
      leave('Lying'),
      perform('Hello'),
      recover(),
      set({ name: 'headlight', value: 'red' }),
      orient(0, -1, 0),
      dim(4),
      wait(0.5),
    ].forEach((_cue) => {
      expect('items' in _cue).toBe(false);
    });
  });

  it('survives a JSON round trip, constituents included', () => {
    const cues = [...CONDUITE, ...Object.values(presets)];
    expect(JSON.parse(JSON.stringify(cues))).toStrictEqual(cues);
  });
});

/** `_cells` written as the browser stores them, then read back. */
const reread = (_cells: ReturnType<typeof numbered>) =>
  v.parse(sheetSchema, JSON.parse(JSON.stringify(_cells)));

/** The message and the location of each issue found in `_value`, read as a stored sheet. */
const issuesOf = (_value: unknown) =>
  map(v.safeParse(sheetSchema, _value).issues ?? [], (_issue) => ({ message: _issue.message, at: v.getDotPath(_issue) }));

/** A stored leaf with identifier `_id`. */
const leaf = (_name: string, _args: unknown[], _id = 0) => ({ id: _id, label: 'x', name: _name, args: _args });

describe('the stored sheet', () => {
  const cells = numbered(CONDUITE, 0);

  it('reads back the cells it was written from, identifiers included', () => {
    expect(reread(cells)).toEqual(cells);
  });

  it('reads back renamed cells and a new group of groups', () => {
    const both: Cell = { id: nextId(cells), label: 'Both', items: [cells[1], cells[2]] };
    const edited = [merge(cells[0], { label: 'Renamed' }), both, ...drop(cells, 3)];
    expect(reread(edited)).toEqual(edited);
  });

  it.each([
    ['a gait the app cannot command', [leaf('enter', ['Stairs'])], 'received "Stairs"', '0.args.0'],
    ['an unknown colour', [leaf('set', [{ name: 'headlight', value: 'pink' }])], 'received "pink"', '0.args.0.value'],
    ['a duration written as text', [leaf('wait', ['1'])], 'Expected number but received "1"', '0.args.0'],
    ['an inherited property as a command name', [leaf('toString', [])], 'received "toString"', '0.name'],
    ['recover with an argument', [leaf('recover', [1])], 'recover takes no argument', '0.args.0'],
    ['an empty group', [{ id: 0, label: 'g', items: [] }], 'a group needs at least one cell', '0.items'],
    ['an empty sheet', [], 'a sheet needs at least one cell', null],
    ['two cells with one identifier', [leaf('wait', [1]), leaf('wait', [2])], 'two cells share an identifier', null],
    ['a group and its cell with one identifier', [{ id: 1, label: 'g', items: [leaf('wait', [1], 1)] }], 'share an identifier', null],
  ])('rejects %s, at its location', (_case, _value, _message, _at) => {
    expect(issuesOf(_value)).toEqual([{ message: expect.stringContaining(_message), at: _at }]);
  });
});
