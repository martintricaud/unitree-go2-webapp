import { beforeEach, describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { enter, leave, perform, sequence, set, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { displayed, fieldStatus } from '../utils/confirmable';
import { reported, robotState, send } from './robotState';
import { NO_ROBOT_SETTINGS, robotMode, robotSettings } from './connection';
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
      pending: {},
      lastOutcome: {},
    });
  });

  it('proposes each field a cue changes, and a confirmation settles them', async () => {
    const { client, sent, reply } = stubClient();
    const done = send(client)(SABOTS);

    expect(sent).toEqual([SABOTS]);
    expect(get(robotState).pending).toEqual({
      mode: { value: 'Backstand', reqId: expect.any(Number) },
      headlight: { value: 'blue', reqId: expect.any(Number) },
    });

    reply('confirmed');
    expect((await done).outcome).toBe('confirmed');
    expect(get(robotState).settled).toMatchObject({ mode: 'Backstand', headlight: 'blue' });
    expect(fieldStatus(get(robotState), 'mode')).toBe('confirmed');
  });

  it('proposes only the fields whose value differs from the displayed one', async () => {
    const { client, reply } = stubClient();
    // The headlight is already blue, so only the mode is proposed.
    const done = send(client)(sequence('', enter('Trotting'), set({ name: 'headlight', value: 'blue' })));
    expect(fieldStatus(get(robotState), 'mode')).toBe('pending');
    expect(fieldStatus(get(robotState), 'headlight')).not.toBe('pending');
    reply('confirmed');
    await done;
  });

  it.each(['failed', 'rejected', 'unknown'] as const)('keeps the settled state on %s', async (_outcome) => {
    const { client, reply } = stubClient();
    const before = get(robotState).settled;
    const done = send(client)(sequence('', enter('ClassicWalk'), set({ name: 'headlight', value: 'green' })));
    expect(displayed(get(robotState))).toMatchObject({ mode: 'ClassicWalk', headlight: 'green' });

    reply(_outcome);
    await done;
    expect(get(robotState).settled).toEqual(before);
    expect(displayed(get(robotState))).toEqual(before);
    expect(fieldStatus(get(robotState), 'mode')).toBe(_outcome);
  });

  it('proposes nothing for a cue that changes no tracked field, and still sends it', async () => {
    const { client, sent, reply } = stubClient();
    const before = get(robotState);
    const done = send(client)(perform('Hello'));
    expect(sent).toEqual([perform('Hello')]);
    expect(get(robotState)).toBe(before);
    reply('failed');
    await done;
    expect(get(robotState)).toBe(before);
  });

  it('proposes nothing for a click on the value already displayed, and still sends it', async () => {
    const { client, sent, reply } = stubClient();
    const cue = set({ name: 'headlight', value: displayed(get(robotState)).headlight });
    const before = get(robotState);
    const done = send(client)(cue);
    expect(sent).toEqual([cue]);
    expect(get(robotState)).toBe(before);
    reply('confirmed');
    expect((await done).outcome).toBe('confirmed');
    expect(get(robotState)).toBe(before);
  });

  it('sets obstacle avoidance and settles it on confirmation', async () => {
    const { client, reply } = stubClient();
    const done = send(client)(set({ name: 'obstacleAvoidance', value: false }));
    expect(get(robotState).pending.obstacleAvoidance?.value).toBe(false);
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

  it('keeps two cues on different fields pending side by side, each settled by its own verdict', async () => {
    const { client, reply } = stubClient();
    const posture = get(robotState).settled.posture;
    const first = send(client)(perform('Sit'));
    const second = send(client)(enter('Trotting'));
    expect(displayed(get(robotState))).toMatchObject({ posture: 'sitting', mode: 'Trotting' });

    reply('failed', 0);
    await first;
    expect(get(robotState).settled.posture).toBe(posture);
    expect(fieldStatus(get(robotState), 'posture')).toBe('failed');
    expect(fieldStatus(get(robotState), 'mode')).toBe('pending');

    reply('confirmed', 1);
    await second;
    expect(get(robotState).settled).toMatchObject({ posture, mode: 'Trotting' });
  });

  it("lets a second cue on the same field replace the first, whose verdict then changes nothing", async () => {
    const { client, reply } = stubClient();
    const first = send(client)(enter('Pose'));
    const second = send(client)(enter('Jumping'));
    expect(displayed(get(robotState)).mode).toBe('Jumping');

    const before = get(robotState);
    reply('confirmed', 0);
    await first;
    expect(get(robotState)).toBe(before);

    reply('failed', 1);
    await second;
    expect(get(robotState).settled.mode).toBe('Trotting');
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

describe("the robot's mode report", () => {
  beforeEach(() => {
    robotMode.set(null);
  });

  it('settles the reported mode', () => {
    robotMode.set('Leaping');
    expect(get(robotState).settled.mode).toBe('Leaping');
  });

  it('leaves the settled mode unchanged when the report names no mode', () => {
    robotMode.set('Handstand');
    robotMode.set(null);
    expect(get(robotState).settled.mode).toBe('Handstand');
  });

  it('settles the same mode again after a report that named no mode', async () => {
    robotMode.set('Backstand');
    robotMode.set(null);
    const { client, reply } = stubClient();
    const done = send(client)(enter('Damp'));
    reply('confirmed');
    await done;
    expect(get(robotState).settled.mode).toBe('Damp');

    robotMode.set('Backstand');
    expect(get(robotState).settled.mode).toBe('Backstand');
  });

  it('leaves a pending mode proposal pending', async () => {
    const { client, reply } = stubClient();
    const done = send(client)(enter('Jumping'));
    robotMode.set('CrossStep');
    expect(get(robotState).settled.mode).toBe('CrossStep');
    expect(fieldStatus(get(robotState), 'mode')).toBe('pending');
    expect(displayed(get(robotState)).mode).toBe('Jumping');
    reply('failed');
    await done;
    expect(get(robotState).settled.mode).toBe('CrossStep');
  });
});
