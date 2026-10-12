import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { buildPayload, dimTo, switchTo, toggleTo } from '../utils/payloads';
import type { CueItem, Sequence } from '../utils/payloads';
import { DANSE_DU_SABBAT } from '../data/cues';
import { crouched, headlight, mode, obstacleAvoidance, send, sitting, speed } from './robotState';
import type { Outcome, OutcomeName } from './outcomes';

/** The sequence in DANSE_DU_SABBAT that carries this display name. */
const sabbatStep = (displayName: string): Sequence => {
  const steps: readonly CueItem[] = DANSE_DU_SABBAT.sequence;
  const found = steps.find(
    (item): item is Sequence => item.kind === 'sequence' && item.displayName === displayName,
  );
  if (found === undefined) throw new Error(`no step named ${displayName}`);
  return found;
};

/** A client whose `request` stays unanswered until the test hands it a verdict, so the stores
 * can be read while the command is in flight. No socket and no relay are involved. */
const stubClient = () => {
  const sent: CueItem[] = [];
  let answer: (outcome: Outcome) => void = () => {
    throw new Error('no request is waiting for a verdict');
  };
  const client = {
    request: (item: CueItem) => {
      sent.push(item);
      return new Promise<Outcome>((resolve) => {
        answer = resolve;
      });
    },
  };
  const reply = (outcome: OutcomeName) => answer({ outcome, code: null, detail: null });
  return { client, sent, reply };
};

describe('robotState', () => {
  describe('the stores', () => {
    it('start settled on their declared values, with nothing outstanding', () => {
      const settled = <T>(value: T) => ({ settled: value, pending: null, lastOutcome: null });
      expect(get(mode)).toEqual(settled('FreeWalk'));
      expect(get(headlight)).toEqual(settled('white'));
      expect(get(speed)).toEqual(settled('normal'));
      expect(get(sitting)).toEqual(settled(false));
      expect(get(crouched)).toEqual(settled(false));
      expect(get(obstacleAvoidance)).toEqual(settled(true));
    });

    it('accept null as a mode, which the radio shows as no mode', () => {
      mode.propose(null, 1);
      expect(get(mode).pending).toEqual({ proposed: null, reqId: 1 });
      mode.resolve(1, { outcome: 'failed', code: null, detail: null });
      expect(get(mode).settled).toBe('FreeWalk');
    });
  });

  describe('the mode store', () => {
    it('is not written by switchTo, whichever mode is asked for', () => {
      const before = get(mode);
      switchTo(true)('Pose');
      switchTo(false)('Leaping');
      switchTo(true)('Trotting');
      expect(get(mode)).toBe(before);
    });

    it('is not written by building a cue out of mode commands', () => {
      const before = get(mode);
      const cue = [switchTo(true)('Handstand'), switchTo(true)('FreeWalk')];
      expect(cue.map((step) => step.command_name)).toEqual(['Handstand', 'FreeWalk']);
      expect(get(mode)).toBe(before);
    });
  });

  describe('send', () => {
    it('proposes mode and headlight under one id, and a confirmation settles both', async () => {
      const { client, sent, reply } = stubClient();
      const cue = sabbatStep('Sabots');
      const done = send(client)(cue);

      expect(sent).toEqual([cue]);
      const modePending = get(mode).pending;
      const headlightPending = get(headlight).pending;
      expect(modePending?.proposed).toBe('Backstand');
      expect(headlightPending?.proposed).toBe('blue');
      expect(modePending?.reqId).toBe(headlightPending?.reqId);

      reply('confirmed');
      expect((await done).outcome).toBe('confirmed');
      expect(get(mode)).toMatchObject({ settled: 'Backstand', pending: null });
      expect(get(headlight)).toMatchObject({ settled: 'blue', pending: null });
    });

    it('reverts both stores to their previous settled values on a failure', async () => {
      const { client, reply } = stubClient();
      const modeBefore = get(mode).settled;
      const headlightBefore = get(headlight).settled;
      const done = send(client)(sabbatStep('Wizard of Oz'));
      expect(get(mode).pending?.proposed).toBe('ClassicWalk');
      expect(get(headlight).pending?.proposed).toBe('green');

      reply('failed');
      await done;
      expect(get(mode)).toMatchObject({ settled: modeBefore, pending: null });
      expect(get(headlight)).toMatchObject({ settled: headlightBefore, pending: null });
      expect(get(mode).lastOutcome?.outcome).toBe('failed');
    });

    it('proposes white for a Brightness command sent with the white override', async () => {
      const { client, reply } = stubClient();
      const done = send(client)(dimTo(1)('Brightness'), { headlight: 'white' });
      expect(get(headlight).pending?.proposed).toBe('white');
      reply('confirmed');
      await done;
      expect(get(headlight)).toMatchObject({ settled: 'white', pending: null });
    });

    it('leaves the stores an item does not affect untouched', async () => {
      const { client, reply } = stubClient();
      const snapshot = () => ({
        mode: get(mode),
        headlight: get(headlight),
        speed: get(speed),
        sitting: get(sitting),
        crouched: get(crouched),
        obstacleAvoidance: get(obstacleAvoidance),
      });
      const before = snapshot();
      const done = send(client)(buildPayload('Hello'));
      reply('confirmed');
      await done;
      expect(snapshot()).toEqual(before);
    });

    it('proposes obstacle avoidance from its toggle and settles it on confirmation', async () => {
      const { client, reply } = stubClient();
      const done = send(client)(toggleTo(false)('ObstaclesAvoid'));
      expect(get(obstacleAvoidance).pending?.proposed).toBe(false);
      reply('confirmed');
      await done;
      expect(get(obstacleAvoidance)).toMatchObject({ settled: false, pending: null });
    });

    it('proposes a null mode for a switch turned off', async () => {
      const { client, reply } = stubClient();
      const done = send(client)(switchTo(false)('Pose'));
      expect(get(mode).pending?.proposed).toBeNull();
      reply('confirmed');
      await done;
      expect(get(mode).settled).toBeNull();
    });
  });
});
