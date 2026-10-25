import { describe, it, expect } from 'vitest';
import { fromKeys, keys, mapValues } from 'remeda';
import { CONDUITE, presets } from '../data/cues';
import { COLOURS, SPEED_LEVELS } from '../data/settings';
import { ACTIONS, GAITS, enter, isCommandable, leave, perform, recover, sequence, set } from './commands';
import { encode } from './webSocketClient';
import WIRE from './encode.fixture.json';

const COMMANDABLE_GAITS = keys(GAITS).filter(isCommandable);

// The fixture holds what the browser sent before cues were typed by their effect.
describe('encode', () => {
  it('sends every cue of the cue sheet as before', () => {
    expect(CONDUITE.map(encode)).toEqual(WIRE.conduite);
  });

  it('sends every preset as before', () => {
    expect(mapValues(WIRE.presets, (_wire, _name) => encode(presets[_name]))).toEqual(WIRE.presets);
  });

  it('sends every mode, action, colour, speed and obstacle-avoidance control as before', () => {
    expect({
      ...fromKeys(COMMANDABLE_GAITS, (_gait) => encode(enter(_gait))),
      Damp: encode(enter('Damp')),
      Pose: encode(enter('Pose')),
    }).toEqual(WIRE.modesOn);
    expect({
      ...fromKeys(ACTIONS, (_action) => encode(perform(_action))),
      Sit: encode(enter('Sitting')),
      RiseSit: encode(leave('Sitting')),
      StandDown: encode(enter('Lying')),
      StandUp: encode(enter('JointLock')),
      BalanceStand: encode(leave('JointLock')),
      RecoveryStand: encode(recover()),
    }).toEqual(WIRE.actions);
    expect(
      mapValues(WIRE.headlight, (_wire, _colour) => encode(set({ name: 'headlight', value: _colour }))),
    ).toEqual(WIRE.headlight);
    expect(mapValues(SPEED_LEVELS, (_level) => encode(set({ name: 'speed', value: _level })))).toEqual(WIRE.speed);
    expect({
      on: encode(set({ name: 'obstacleAvoidance', value: true })),
      off: encode(set({ name: 'obstacleAvoidance', value: false })),
    }).toEqual(WIRE.obstacleAvoidance);
  });

  it('sends the white headlight as a Headlight colour, no longer as a Brightness', () => {
    expect(COLOURS).toContain('white');
    expect(encode(set({ name: 'headlight', value: 'white' }))).toEqual({
      ...WIRE.headlight.red,
      parameter: { color: 'white' },
    });
  });

  it('sends a gait as its request with the flag on', () => {
    COMMANDABLE_GAITS.forEach((_gait) => {
      expect(encode(enter(_gait))).toMatchObject({ parameter: { data: true } });
    });
  });

  it("sends a posture's several steps as one sequence, and splices them into a named sequence", () => {
    expect(encode(leave('Lying'))).toEqual({
      kind: 'sequence',
      displayName: 'Exit Lying',
      sequence: [encode(enter('JointLock')), encode(leave('JointLock'))],
    });
    expect(encode(sequence('Named', enter('Pose')))).toEqual({
      kind: 'sequence',
      displayName: 'Named',
      sequence: [
        encode(perform('StopMove')),
        { kind: 'command', topic: 'SPORT_MOD', api_id: 1028, command_name: 'Pose', parameter: { data: true } },
      ],
    });
    expect(encode(leave('Pose'))).toMatchObject({ command_name: 'Pose', parameter: { data: false } });
  });
});
