import { describe, it, expect } from 'vitest';
import { entries, keys, mapValues } from 'remeda';
import { ACTIONS } from '../data/actions';
import { CONDUITE, presets } from '../data/cues';
import { MODES } from '../data/modes';
import { LIGHT_EMOJIS, SPEED_LEVELS } from '../data/options';
import { enter, leave, perform, set } from './commands';
import { encode } from './encode';
import WIRE from './encode.fixture.json';

// The fixture holds what the browser sent before cues were typed by their effect.
describe('encode', () => {
  it('sends every cue of the cue sheet as before', () => {
    expect(CONDUITE.map(encode)).toEqual(WIRE.conduite);
  });

  it('sends every preset as before', () => {
    expect(mapValues(WIRE.presets, (_wire, _name) => encode(presets[_name]))).toEqual(WIRE.presets);
  });

  it('sends every mode, action, colour, speed and obstacle-avoidance control as before', () => {
    expect(mapValues(MODES, (_entry, _mode) => encode(enter(_mode)))).toEqual(WIRE.modesOn);
    expect(encode(leave('Leaping'))).toEqual(WIRE.leapingOff);
    expect(mapValues(ACTIONS, (_entry, _action) => encode(perform(_action)))).toEqual(WIRE.actions);
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
    expect(keys(LIGHT_EMOJIS)).toContain('white');
    expect(encode(set({ name: 'headlight', value: 'white' }))).toEqual({
      ...WIRE.headlight.red,
      parameter: { color: 'white' },
    });
  });

  it('sends a mode under its own argument name', () => {
    entries(MODES).forEach(([_mode, _entry]) => {
      expect(encode(enter(_mode))).toMatchObject({ parameter: { [_entry.argument]: true } });
    });
  });
});
