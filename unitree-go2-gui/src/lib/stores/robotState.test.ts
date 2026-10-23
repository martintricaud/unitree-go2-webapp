import { beforeEach, describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { enter, leave, perform, sequence, set, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { displayed, fieldStatus } from '../utils/confirmable';
import { reported, robotState, send } from './robotState';
import { robotConnected, robotReport } from './connection';
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
      settled: { gait: 'FreeWalk', posture: null, headlight: 'green', speed: 0, obstacleAvoidance: true },
      pending: {},
      lastOutcome: {},
    });
  });

  it('proposes each field a cue changes, and a confirmation settles them', async () => {
    const { client, sent, reply } = stubClient();
    const done = send(client)(SABOTS);

    expect(sent).toEqual([SABOTS]);
    expect(get(robotState).pending).toEqual({
      gait: { value: 'Backstand', reqId: expect.any(Number) },
      headlight: { value: 'blue', reqId: expect.any(Number) },
    });

    reply('confirmed');
    expect((await done).outcome).toBe('confirmed');
    expect(get(robotState).settled).toMatchObject({ gait: 'Backstand', headlight: 'blue' });
    expect(fieldStatus(get(robotState), 'gait')).toBe('confirmed');
  });

  it('proposes only the fields whose value differs from the displayed one', async () => {
    const { client, reply } = stubClient();
    // The headlight is already blue, so only the gait is proposed.
    const done = send(client)(sequence('', enter('Trotting'), set({ name: 'headlight', value: 'blue' })));
    expect(fieldStatus(get(robotState), 'gait')).toBe('pending');
    expect(fieldStatus(get(robotState), 'headlight')).not.toBe('pending');
    reply('confirmed');
    await done;
  });

  it.each(['failed', 'rejected', 'unknown'] as const)('keeps the settled state on %s', async (_outcome) => {
    const { client, reply } = stubClient();
    const before = get(robotState).settled;
    const done = send(client)(sequence('', enter('ClassicWalk'), set({ name: 'headlight', value: 'green' })));
    expect(displayed(get(robotState))).toMatchObject({ gait: 'ClassicWalk', headlight: 'green' });

    reply(_outcome);
    await done;
    expect(get(robotState).settled).toEqual(before);
    expect(displayed(get(robotState))).toEqual(before);
    expect(fieldStatus(get(robotState), 'gait')).toBe(_outcome);
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

  it('settles no gait once a gait was left', async () => {
    const { client, reply } = stubClient();
    const done = send(client)(leave('Trotting'));
    reply('confirmed');
    await done;
    expect(get(robotState).settled.gait).toBeNull();
  });

  it('keeps two cues on different fields pending side by side, each settled by its own verdict', async () => {
    const { client, reply } = stubClient();
    const gait = get(robotState).settled.gait;
    const first = send(client)(enter('Trotting'));
    const second = send(client)(perform('Sit'));
    expect(displayed(get(robotState))).toMatchObject({ gait: 'Trotting', posture: 'Sitting' });

    reply('failed', 0);
    await first;
    expect(get(robotState).settled.gait).toBe(gait);
    expect(fieldStatus(get(robotState), 'gait')).toBe('failed');
    expect(fieldStatus(get(robotState), 'posture')).toBe('pending');

    reply('confirmed', 1);
    await second;
    expect(get(robotState).settled).toMatchObject({ gait, posture: 'Sitting' });
  });

  it("lets a second cue on the same field replace the first, whose verdict then changes nothing", async () => {
    const { client, reply } = stubClient();
    const { gait } = get(robotState).settled;
    const first = send(client)(enter('Pose'));
    const second = send(client)(enter('Jumping'));
    expect(displayed(get(robotState))).toMatchObject({ gait: 'Jumping', posture: null });

    const before = get(robotState);
    reply('confirmed', 0);
    await first;
    expect(get(robotState)).toBe(before);

    reply('failed', 1);
    await second;
    expect(get(robotState).settled.gait).toBe(gait);
  });

  it('keeps the gait on entering Pose', async () => {
    const { client, reply } = stubClient();
    const enteredGait = send(client)(enter('Backstand'));
    reply('confirmed');
    await enteredGait;
    const done = send(client)(enter('Pose'));
    expect(get(robotState).pending).toEqual({ posture: { value: 'Pose', reqId: expect.any(Number) } });
    reply('confirmed');
    await done;
    expect(get(robotState).settled).toMatchObject({ gait: 'Backstand', posture: 'Pose' });
  });

  it('leaves the gait as it was before Sit, and no posture, after Sit then RiseSit', async () => {
    const { client, reply } = stubClient();
    const enteredGait = send(client)(enter('EconomicGait'));
    reply('confirmed');
    await enteredGait;
    const sat = send(client)(perform('Sit'));
    reply('confirmed');
    await sat;
    expect(get(robotState).settled).toMatchObject({ gait: 'EconomicGait', posture: 'Sitting' });
    const rose = send(client)(perform('RiseSit'));
    expect(get(robotState).pending).toEqual({ posture: { value: null, reqId: expect.any(Number) } });
    reply('confirmed');
    await rose;
    expect(get(robotState).settled).toMatchObject({ gait: 'EconomicGait', posture: null });
  });
});

describe("the robot's report", () => {
  // The robot is up, and nothing it stated before this test counts as reported.
  beforeEach(() => {
    robotConnected.set(false);
    robotConnected.set(true);
  });

  /** Settles `_cue` through a client that confirms it at once. */
  const confirm = (_cue: Cue) => {
    const { client, reply } = stubClient();
    const done = send(client)(_cue);
    reply('confirmed');
    return done;
  };

  it('starts with no field reported', () => {
    expect(get(reported)).toEqual({});
  });

  it('applies exactly the fields a report states, and changes no other field', () => {
    const before = get(robotState).settled;
    robotReport.set({ speed: 1 });
    expect(get(robotState).settled).toEqual({ ...before, speed: 1 });
    expect(get(reported)).toEqual({ speed: true });

    robotReport.set({ obstacleAvoidance: false });
    expect(get(robotState).settled).toEqual({ ...before, speed: 1, obstacleAvoidance: false });
    expect(get(reported)).toEqual({ speed: true, obstacleAvoidance: true });
  });

  it('applies each of two reports stating the same gait', async () => {
    robotReport.set({ gait: 'Backstand' });
    await confirm(enter('Trotting'));
    expect(get(robotState).settled.gait).toBe('Trotting');

    robotReport.set({ gait: 'Backstand' });
    expect(get(robotState).settled.gait).toBe('Backstand');
  });

  it('does not re-apply an earlier gait report on a speed report, nor the reverse', async () => {
    robotReport.set({ gait: 'Handstand' });
    await confirm(enter('Trotting'));
    robotReport.set({ speed: -1 });
    expect(get(robotState).settled).toMatchObject({ gait: 'Trotting', speed: -1 });

    await confirm(set({ name: 'speed', value: 0 }));
    robotReport.set({ gait: 'Leaping' });
    expect(get(robotState).settled).toMatchObject({ gait: 'Leaping', speed: 0 });
  });

  it('marks a posture report as reported, and keeps the gait', () => {
    robotReport.set({ gait: 'StaticWalk', posture: null });
    robotReport.set({ posture: 'Sitting' });
    expect(get(robotState).settled).toMatchObject({ gait: 'StaticWalk', posture: 'Sitting' });
    expect(get(reported)).toEqual({ gait: true, posture: true });
  });

  it('keeps the settled values but clears reported when robotConnected turns false', () => {
    robotReport.set({ speed: -1, obstacleAvoidance: true });
    const { settled } = get(robotState);
    robotConnected.set(false);
    expect(get(robotState).settled).toEqual(settled);
    expect(get(reported)).toEqual({});
  });

  it('leaves a pending gait proposal pending', async () => {
    const { client, reply } = stubClient();
    const done = send(client)(enter('Jumping'));
    robotReport.set({ gait: 'CrossStep' });
    expect(get(robotState).settled.gait).toBe('CrossStep');
    expect(fieldStatus(get(robotState), 'gait')).toBe('pending');
    expect(displayed(get(robotState)).gait).toBe('Jumping');
    reply('failed');
    await done;
    expect(get(robotState).settled.gait).toBe('CrossStep');
  });
});
