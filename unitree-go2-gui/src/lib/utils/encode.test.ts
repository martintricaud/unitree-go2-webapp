import { describe, it, expect } from 'vitest';
import { fromKeys, keys, mapValues } from 'remeda';
import { CONDUITE, presets } from '../data/cues';
import { COLOURS, SPEED_LEVELS } from '../data/settings';
import { ACTIONS, GAITS, dim, enter, isCommandable, leave, orient, perform, recover, sequence, set, wait } from './commands';
import WIRE from './encode.fixture.json';

const COMMANDABLE_GAITS = keys(GAITS).filter(isCommandable);

/** A message as the fixture records it: a command, a wait, or a sequence of messages. */
type Recorded = { kind: string; sequence?: Recorded[] };

/** The commands and waits a recorded message sends, in order. */
const flattened = (_message: Recorded): Recorded[] => _message.sequence?.flatMap(flattened) ?? [_message];

// The fixture holds what the browser sent while a sequence could hold further sequences.
describe('steps', () => {
  it('sends every cue of the cue sheet as before', () => {
    expect(CONDUITE.map((_cue) => _cue.steps)).toEqual(WIRE.conduite.map(flattened));
  });

  it('sends every preset as before', () => {
    expect(mapValues(WIRE.presets, (_wire, _name) => presets[_name].steps)).toEqual(mapValues(WIRE.presets, flattened));
  });

  it('sends every mode, action, colour, speed and obstacle-avoidance control as before', () => {
    expect({
      ...fromKeys(COMMANDABLE_GAITS, (_gait) => enter(_gait).steps),
      Damp: enter('Damp').steps,
      Pose: enter('Pose').steps,
    }).toEqual(mapValues(WIRE.modesOn, flattened));
    expect({
      ...fromKeys(ACTIONS, (_action) => perform(_action).steps),
      Sit: enter('Sitting').steps,
      RiseSit: leave('Sitting').steps,
      StandDown: enter('Lying').steps,
      StandUp: enter('JointLock').steps,
      BalanceStand: leave('JointLock').steps,
      RecoveryStand: recover().steps,
    }).toEqual(mapValues(WIRE.actions, flattened));
    expect(mapValues(WIRE.headlight, (_wire, _colour) => set({ name: 'headlight', value: _colour }).steps)).toEqual(
      mapValues(WIRE.headlight, flattened),
    );
    expect(mapValues(SPEED_LEVELS, (_level) => set({ name: 'speed', value: _level }).steps)).toEqual(
      mapValues(WIRE.speed, flattened),
    );
    expect({
      on: set({ name: 'obstacleAvoidance', value: true }).steps,
      off: set({ name: 'obstacleAvoidance', value: false }).steps,
    }).toEqual(mapValues(WIRE.obstacleAvoidance, flattened));
  });

  it('sends the white headlight as a Headlight colour, no longer as a Brightness', () => {
    expect(COLOURS).toContain('white');
    expect(set({ name: 'headlight', value: 'white' }).steps).toEqual([{ ...WIRE.headlight.red, parameter: { color: 'white' } }]);
  });

  it('sends a gait as its request with the flag on', () => {
    COMMANDABLE_GAITS.forEach((_gait) => {
      expect(enter(_gait).steps).toMatchObject([{ parameter: { data: true } }]);
    });
  });

  it("sends a posture's several steps in a row, and splices them into a named sequence", () => {
    expect(leave('Lying').steps).toEqual([...enter('JointLock').steps, ...leave('JointLock').steps]);
    expect(sequence('Named', enter('Pose')).steps).toEqual([
      ...perform('StopMove').steps,
      { kind: 'command', topic: 'SPORT_MOD', api_id: 1028, command_name: 'Pose', parameter: { data: true } },
    ]);
    expect(leave('Pose').steps).toEqual([
      { kind: 'command', topic: 'SPORT_MOD', api_id: 1028, command_name: 'Pose', parameter: { data: false } },
    ]);
  });
});

describe('label', () => {
  it('names each cue as the cue sheet and the outcome log show it', () => {
    expect(
      [
        enter('Leaping'),
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
      'Leaping',
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
    expect(enter('Leaping').changes).toEqual([{ gait: 'Leaping', posture: null }]);
    expect(enter('Pose').changes).toEqual([{ posture: 'Pose' }]);
    expect(leave('Pose').changes).toEqual([{ posture: null }]);
    expect(recover().changes).toEqual([{ posture: null }]);
    expect(set({ name: 'headlight', value: 'red' }).changes).toEqual([{ headlight: 'red' }]);
    [perform('Hello'), orient(0, -1, 0), dim(4), wait(1)].forEach((_cue) => {
      expect(_cue.changes).toEqual([]);
    });
    expect(sequence('', enter('Trotting'), wait(1), enter('Sitting')).changes).toEqual([
      { gait: 'Trotting', posture: null },
      { posture: 'Sitting' },
    ]);
  });
});

describe('items', () => {
  it('keeps the cues a sequence was built from, in order', () => {
    expect(sequence('Named', enter('Pose'), wait(1)).items).toEqual([enter('Pose'), wait(1)]);
  });

  it('is empty for every cue not built by sequence', () => {
    [
      enter('Leaping'),
      enter('Pose'),
      leave('Lying'),
      perform('Hello'),
      recover(),
      set({ name: 'headlight', value: 'red' }),
      orient(0, -1, 0),
      dim(4),
      wait(0.5),
    ].forEach((_cue) => {
      expect(_cue.items).toEqual([]);
    });
  });

  it('survives a JSON round trip, constituents included', () => {
    const cues = [...CONDUITE, ...Object.values(presets)];
    expect(JSON.parse(JSON.stringify(cues))).toStrictEqual(cues);
  });
});
