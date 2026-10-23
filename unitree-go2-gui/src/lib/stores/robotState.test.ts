import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { enter, leave, perform, sequence, set, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { displayed } from '../utils/confirmable';
import { reported, robotState, send } from './robotState';
import { NO_ROBOT_SETTINGS, robotSettings } from './connection';
import type { Outcome } from './outcomes';

/** A client whose requests stay unanswered until the test hands each a verdict, so the store
 * can be read while a cue is in flight. No socket and no relay are involved. */
const stubClient = () => {
  const sent: Cue[] = [];
  const answers: ((outcome: Outcome) => void)[] = [];
  const client = {
    request: (cue: Cue) => {
      sent.push(cue);
      return new Promise<Outcome>((resolve) => {
        answers.push(resolve);
      });
    },
  };
  const reply = (outcome: Outcome['outcome'], index = answers.length - 1) =>
    answers[index]({ outcome, code: null, detail: '', reqId: index, label: '', at: 0 });
  return { client, sent, reply };
};

const SABOTS = sequence(
  'Sabots',
  enter('FreeWalk'),
  wait(0.1),
  enter('Backstand'),
  wait(0.1),
  set({ name: 'headlight', value: 'blue' }),
);

describe('robotState', () => {
  it('starts settled on the initial state, with nothing attempted', () => {
    expect(get(robotState)).toEqual({
      settled: { mode: 'FreeWalk', posture: 'standing', headlight: 'green', speed: 0, obstacleAvoidance: true },
      pending: null,
      lastAttempt: null,
    });
  });

  it('proposes the state a cue leads to, and a confirmation settles it', async () => {
    const { client, sent, reply } = stubClient();
    const done = send(client)(SABOTS);

    expect(sent).toEqual([SABOTS]);
    expect(get(robotState).pending?.proposed).toMatchObject({ mode: 'Backstand', headlight: 'blue' });

    reply('confirmed');
    expect((await done).outcome).toBe('confirmed');
    expect(get(robotState)).toMatchObject({
      settled: { mode: 'Backstand', headlight: 'blue' },
      pending: null,
    });
  });

  it('reverts to the settled state on a failure', async () => {
    const { client, reply } = stubClient();
    const before = get(robotState).settled;
    const done = send(client)(sequence('', enter('ClassicWalk'), set({ name: 'headlight', value: 'green' })));
    expect(displayed(get(robotState))).toMatchObject({ mode: 'ClassicWalk', headlight: 'green' });

    reply('failed');
    await done;
    expect(get(robotState).settled).toEqual(before);
    expect(get(robotState).lastAttempt?.outcome.outcome).toBe('failed');
  });

  it('proposes nothing for a cue that changes no tracked field', async () => {
    const { client, reply } = stubClient();
    const before = get(robotState);
    const done = send(client)(perform('Hello'));
    expect(get(robotState)).toBe(before);
    reply('failed');
    await done;
    expect(get(robotState)).toBe(before);
  });

  it('sets obstacle avoidance and settles it on confirmation', async () => {
    const { client, reply } = stubClient();
    const done = send(client)(set({ name: 'obstacleAvoidance', value: false }));
    expect(get(robotState).pending?.proposed.obstacleAvoidance).toBe(false);
    reply('confirmed');
    await done;
    expect(get(robotState).settled.obstacleAvoidance).toBe(false);
  });

  it('settles no mode once a mode was left', async () => {
    const { client, reply } = stubClient();
    const done = send(client)(leave('Pose'));
    reply('confirmed');
    await done;
    expect(get(robotState).settled.mode).toBeNull();
  });

  it('lets a second cue replace the first, whose verdict is then ignored', async () => {
    const { client, reply } = stubClient();
    const first = send(client)(perform('Sit'));
    const second = send(client)(enter('Trotting'));
    expect(get(robotState).pending?.proposed).toMatchObject({ posture: 'sitting', mode: 'Trotting' });

    reply('failed', 0);
    await first;
    expect(get(robotState).pending?.proposed.mode).toBe('Trotting');

    reply('confirmed', 1);
    await second;
    expect(get(robotState).settled).toMatchObject({ posture: 'sitting', mode: 'Trotting' });
  });
});

describe("the robot's report", () => {
  it('starts with no field reported', () => {
    expect(get(reported)).toEqual({ speed: false, obstacleAvoidance: false });
  });

  it('settles each reported field and marks only that field reported', () => {
    robotSettings.set({ speed: 1, obstacleAvoidance: null });
    expect(get(robotState).settled.speed).toBe(1);
    expect(get(reported)).toEqual({ speed: true, obstacleAvoidance: false });

    robotSettings.set({ speed: 1, obstacleAvoidance: false });
    expect(get(robotState).settled.obstacleAvoidance).toBe(false);
    expect(get(reported)).toEqual({ speed: true, obstacleAvoidance: true });
  });

  it('keeps the settled values but marks both fields unreported once the report is cleared', () => {
    robotSettings.set({ speed: -1, obstacleAvoidance: true });
    const { settled } = get(robotState);
    robotSettings.set(NO_ROBOT_SETTINGS);
    expect(get(robotState).settled).toEqual(settled);
    expect(get(reported)).toEqual({ speed: false, obstacleAvoidance: false });
  });
});
