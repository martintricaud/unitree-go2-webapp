import { describe, it, expect } from 'vitest';
import { get, writable } from 'svelte/store';
import { enter, leave, perform, sequence, set, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { displayed } from '../utils/confirmable';
import { createRobotState } from './robotState';
import type { Outcome } from './outcomes';

/** The last request id a stub client minted. Shared by every stub, so no two requests in this
 * file share an id, as with the real client. */
let lastStubId = 0;

/** A client whose requests stay unanswered until the test hands each a verdict, so the store
 * can be read while a cue is in flight. No socket and no relay are involved. */
const stubClient = () => {
  const sent: Cue[] = [];
  const reqIds: number[] = [];
  const answers: ((outcome: Outcome) => void)[] = [];
  const client = {
    request: (cue: Cue) => {
      sent.push(cue);
      const reqId = (lastStubId += 1);
      reqIds.push(reqId);
      const verdict = new Promise<Outcome>((resolve) => {
        answers.push(resolve);
      });
      return { reqId, verdict };
    },
  };
  const reply = (outcome: Outcome['outcome'], index = answers.length - 1) =>
    answers[index]({ outcome, code: null, detail: '', reqId: reqIds[index], label: '', at: 0 });
  return { client, sent, reqIds, reply };
};

/** A robot state of its own, built on a stub client and on report and connection stores no other
 * test writes. The robot is up, and nothing it stated counts as reported yet. */
const setup = () => {
  const { client, sent, reqIds, reply } = stubClient();
  const sources: Parameters<typeof createRobotState>[0] = {
    client,
    robotReport: writable({}),
    robotConnected: writable(true),
  };
  const robotState = createRobotState(sources);
  /** Settles `_cue` by confirming it at once. */
  const confirm = (_cue: Cue) => {
    const done = robotState.send(_cue);
    reply('confirmed');
    return done;
  };
  return { ...sources, robotState, reported: robotState.reported, sent, reqIds, reply, confirm };
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
    const { robotState } = setup();
    expect(get(robotState)).toEqual({
      settled: {
        gait: 'FreeWalk',
        posture: null,
        previousGait: 'FreeWalk',
        headlight: 'green',
        speed: 0,
        obstacleAvoidance: true,
      },
      pending: {},
    });
  });

  it('proposes under the request id the client sent to the relay', async () => {
    const { robotState, reqIds, reply } = setup();
    const done = robotState.send(set({ name: 'headlight', value: 'red' }));
    expect(get(robotState).pending.headlight?.reqId).toBe(reqIds[0]);

    reply('confirmed');
    await done;
    expect(get(robotState).pending).toEqual({});
  });

  it('proposes each field a cue changes, and a confirmation settles them', async () => {
    const { robotState, sent, reply } = setup();
    const done = robotState.send(SABOTS);

    expect(sent).toEqual([SABOTS]);
    // previousGait goes from FreeWalk to FreeWalk, so it is not proposed.
    expect(get(robotState).pending).toEqual({
      gait: { value: 'Backstand', reqId: expect.any(Number) },
      headlight: { value: 'blue', reqId: expect.any(Number) },
    });

    reply('confirmed');
    expect((await done).outcome).toBe('confirmed');
    expect(get(robotState).settled).toMatchObject({ gait: 'Backstand', headlight: 'blue' });
    expect(get(robotState).pending).toEqual({});
  });

  it('proposes only the fields whose value differs from the displayed one', async () => {
    const { robotState, reply, confirm } = setup();
    await confirm(set({ name: 'headlight', value: 'blue' }));
    // The headlight is already blue, so only the gait is proposed.
    const done = robotState.send(sequence('', enter('Trotting'), set({ name: 'headlight', value: 'blue' })));
    expect(get(robotState).pending.gait).toBeDefined();
    expect(get(robotState).pending.headlight).toBeUndefined();
    reply('confirmed');
    await done;
  });

  it.each(['failed', 'rejected', 'unknown'] as const)('keeps the settled state on %s', async (_outcome) => {
    const { robotState, reply } = setup();
    const before = get(robotState).settled;
    const done = robotState.send(sequence('', enter('ClassicWalk'), set({ name: 'headlight', value: 'green' })));
    expect(displayed(get(robotState))).toMatchObject({ gait: 'ClassicWalk', headlight: 'green' });

    reply(_outcome);
    await done;
    expect(get(robotState).settled).toEqual(before);
    expect(displayed(get(robotState))).toEqual(before);
    expect(get(robotState).pending).toEqual({});
  });

  it('proposes nothing for a cue that changes no tracked field, and still sends it', async () => {
    const { robotState, sent, reply } = setup();
    const before = get(robotState);
    const done = robotState.send(perform('Hello'));
    expect(sent).toEqual([perform('Hello')]);
    expect(get(robotState)).toBe(before);
    reply('failed');
    await done;
    expect(get(robotState)).toBe(before);
  });

  it('proposes nothing for a click on the value already displayed, and still sends it', async () => {
    const { robotState, sent, reply } = setup();
    const cue = set({ name: 'headlight', value: displayed(get(robotState)).headlight });
    const before = get(robotState);
    const done = robotState.send(cue);
    expect(sent).toEqual([cue]);
    expect(get(robotState)).toBe(before);
    reply('confirmed');
    expect((await done).outcome).toBe('confirmed');
    expect(get(robotState)).toBe(before);
  });

  it('sets obstacle avoidance and settles it on confirmation', async () => {
    const { robotState, reply } = setup();
    const done = robotState.send(set({ name: 'obstacleAvoidance', value: false }));
    expect(get(robotState).pending.obstacleAvoidance?.value).toBe(false);
    reply('confirmed');
    await done;
    expect(get(robotState).settled.obstacleAvoidance).toBe(false);
  });

  it('settles no gait once a gait was left', async () => {
    const { robotState, reply } = setup();
    const done = robotState.send(leave('Trotting'));
    reply('confirmed');
    await done;
    expect(get(robotState).settled.gait).toBeNull();
  });

  it('keeps two cues on different fields pending side by side, each settled by its own verdict', async () => {
    const { robotState, reply } = setup();
    const gait = get(robotState).settled.gait;
    const first = robotState.send(enter('Trotting'));
    const second = robotState.send(perform('Sit'));
    expect(displayed(get(robotState))).toMatchObject({ gait: 'Trotting', posture: 'Sitting' });

    reply('failed', 0);
    await first;
    expect(get(robotState).settled.gait).toBe(gait);
    expect(get(robotState).pending.gait).toBeUndefined();
    expect(get(robotState).pending.posture).toBeDefined();

    reply('confirmed', 1);
    await second;
    expect(get(robotState).settled).toMatchObject({ gait, posture: 'Sitting' });
  });

  it("lets a second cue on the same field replace the first, whose verdict then changes nothing", async () => {
    const { robotState, reply } = setup();
    const { gait } = get(robotState).settled;
    const first = robotState.send(enter('Pose'));
    const second = robotState.send(enter('Jumping'));
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
    const { robotState, reply } = setup();
    const enteredGait = robotState.send(enter('Backstand'));
    reply('confirmed');
    await enteredGait;
    const done = robotState.send(enter('Pose'));
    expect(get(robotState).pending).toEqual({ posture: { value: 'Pose', reqId: expect.any(Number) } });
    reply('confirmed');
    await done;
    expect(get(robotState).settled).toMatchObject({ gait: 'Backstand', posture: 'Pose' });
  });

  it('leaves the gait as it was before Sit, and no posture, after Sit then RiseSit', async () => {
    const { robotState, reply } = setup();
    const enteredGait = robotState.send(enter('EconomicGait'));
    reply('confirmed');
    await enteredGait;
    const sat = robotState.send(perform('Sit'));
    reply('confirmed');
    await sat;
    expect(get(robotState).settled).toMatchObject({ gait: 'EconomicGait', posture: 'Sitting' });
    const rose = robotState.send(perform('RiseSit'));
    expect(get(robotState).pending).toEqual({ posture: { value: null, reqId: expect.any(Number) } });
    reply('confirmed');
    await rose;
    expect(get(robotState).settled).toMatchObject({ gait: 'EconomicGait', posture: null });
  });

  it('proposes the old gait as previousGait when a cue changes the gait', async () => {
    const { robotState, reply } = setup();
    const entered = robotState.send(enter('StaticWalk'));
    reply('confirmed');
    await entered;
    const leaping = robotState.send(enter('Leaping'));
    expect(get(robotState).pending).toEqual({
      gait: { value: 'Leaping', reqId: expect.any(Number) },
      previousGait: { value: 'StaticWalk', reqId: expect.any(Number) },
    });
    reply('confirmed');
    await leaping;
    expect(get(robotState).settled).toMatchObject({ gait: 'Leaping', previousGait: 'StaticWalk' });
  });

  it('keeps previousGait on entering and leaving a posture', async () => {
    const { robotState, reply } = setup();
    const { previousGait } = get(robotState).settled;
    for (const cue of [enter('Pose'), leave('Pose'), perform('Sit'), perform('RiseSit')]) {
      const done = robotState.send(cue);
      expect(get(robotState).pending.previousGait).toBeUndefined();
      reply('confirmed');
      await done;
      expect(get(robotState).settled.previousGait).toBe(previousGait);
    }
  });
});

describe("the robot's report", () => {
  it('starts with no field reported', () => {
    const { reported } = setup();
    expect(get(reported)).toEqual({});
  });

  it('applies exactly the fields a report states, and changes no other field', () => {
    const { robotState, reported, robotReport } = setup();
    const before = get(robotState).settled;
    robotReport.set({ speed: 1 });
    expect(get(robotState).settled).toEqual({ ...before, speed: 1 });
    expect(get(reported)).toEqual({ speed: true });

    robotReport.set({ obstacleAvoidance: false });
    expect(get(robotState).settled).toEqual({ ...before, speed: 1, obstacleAvoidance: false });
    expect(get(reported)).toEqual({ speed: true, obstacleAvoidance: true });
  });

  it('applies each of two reports stating the same gait', async () => {
    const { robotState, robotReport, confirm } = setup();
    robotReport.set({ gait: 'Backstand' });
    await confirm(enter('Trotting'));
    expect(get(robotState).settled.gait).toBe('Trotting');

    robotReport.set({ gait: 'Backstand' });
    expect(get(robotState).settled.gait).toBe('Backstand');
  });

  it('does not re-apply an earlier gait report on a speed report, nor the reverse', async () => {
    const { robotState, robotReport, confirm } = setup();
    robotReport.set({ gait: 'Handstand' });
    await confirm(enter('Trotting'));
    robotReport.set({ speed: -1 });
    expect(get(robotState).settled).toMatchObject({ gait: 'Trotting', speed: -1 });

    await confirm(set({ name: 'speed', value: 0 }));
    robotReport.set({ gait: 'Leaping' });
    expect(get(robotState).settled).toMatchObject({ gait: 'Leaping', speed: 0 });
  });

  it('marks a posture report as reported, and keeps the gait', () => {
    const { robotState, reported, robotReport } = setup();
    robotReport.set({ gait: 'StaticWalk', posture: null });
    robotReport.set({ posture: 'Sitting' });
    expect(get(robotState).settled).toMatchObject({ gait: 'StaticWalk', posture: 'Sitting' });
    expect(get(reported)).toEqual({ gait: true, posture: true });
  });

  it('keeps the settled values but clears reported when robotConnected turns false', () => {
    const { robotState, reported, robotReport, robotConnected } = setup();
    robotReport.set({ speed: -1, obstacleAvoidance: true });
    const { settled } = get(robotState);
    robotConnected.set(false);
    expect(get(robotState).settled).toEqual(settled);
    expect(get(reported)).toEqual({});
  });

  it('sets previousGait to the old gait when a report changes the gait', async () => {
    const { robotState, reported, robotReport, confirm } = setup();
    await confirm(enter('Trotting'));
    robotReport.set({ gait: 'Stairs' });
    expect(get(robotState).settled).toMatchObject({ gait: 'Stairs', previousGait: 'Trotting' });
    expect(get(reported)).toEqual({ gait: true });
  });

  it('keeps previousGait when a report states the settled gait, or a posture', async () => {
    const { robotState, robotReport, confirm } = setup();
    await confirm(enter('Trotting'));
    const { previousGait } = get(robotState).settled;
    robotReport.set({ gait: 'Trotting' });
    robotReport.set({ posture: 'Sitting' });
    robotReport.set({ posture: null });
    expect(get(robotState).settled).toMatchObject({ gait: 'Trotting', previousGait });
  });

  it('keeps previousGait when a report states a gait after the gait was unknown', async () => {
    const { robotState, robotReport, confirm } = setup();
    await confirm(enter('Jumping'));
    await confirm(leave('Jumping'));
    expect(get(robotState).settled).toMatchObject({ gait: null, previousGait: 'Jumping' });
    robotReport.set({ gait: 'CrossStep' });
    expect(get(robotState).settled).toMatchObject({ gait: 'CrossStep', previousGait: 'Jumping' });
  });

  it('leaves a pending gait proposal pending', async () => {
    const { robotState, robotReport, reply } = setup();
    const done = robotState.send(enter('Jumping'));
    robotReport.set({ gait: 'CrossStep' });
    expect(get(robotState).settled.gait).toBe('CrossStep');
    expect(get(robotState).pending.gait).toBeDefined();
    expect(displayed(get(robotState)).gait).toBe('Jumping');
    reply('failed');
    await done;
    expect(get(robotState).settled.gait).toBe('CrossStep');
  });
});
