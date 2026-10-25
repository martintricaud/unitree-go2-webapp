import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { enter, set, transition } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { displayed } from '../utils/confirmable';
import { createMirror } from './mirror';

/** The last request id a test proposed under. Shared by every test, so no two proposals in this
 * file share an id, as with the real client. */
let lastReqId = 0;

/** A mirror of its own, whose robot is up, and of which nothing counts as reported yet. */
const setup = () => {
  const mirror = createMirror();
  mirror.setRobotConnected(true);
  /** Settles every field `_cue` sets, as a confirmed request would. */
  const confirm = (_cue: Cue) => {
    const reqId = (lastReqId += 1);
    mirror.propose(transition(_cue)(displayed(get(mirror).robot)), reqId);
    mirror.resolve(reqId, { outcome: 'confirmed', code: 0, detail: '', reqId, label: _cue.label, at: 0 });
  };
  return { mirror, confirm };
};

describe('mirror', () => {
  it('starts with the channel closed, no robot, nothing told, and the robot settled on its boot state', () => {
    expect(get(createMirror())).toEqual({
      channelOpen: false,
      robotConnected: false,
      lidarOn: false,
      monitoringOn: false,
      robot: {
        settled: {
          gait: 'FreeWalk',
          posture: null,
          previousGait: 'FreeWalk',
          headlight: 'green',
          speed: 0,
          obstacleAvoidance: true,
        },
        pending: {},
      },
      reported: {},
    });
  });

  it('records each flag it is given', () => {
    const { mirror } = setup();
    mirror.setChannelOpen(true);
    mirror.setLidarOn(true);
    mirror.setMonitoringOn(true);
    expect(get(mirror)).toMatchObject({ channelOpen: true, robotConnected: true, lidarOn: true, monitoringOn: true });
  });
});

describe("the robot's report", () => {
  it('starts with no field reported', () => {
    const { mirror } = setup();
    expect(get(mirror).reported).toEqual({});
  });

  it('applies exactly the fields a report states, and changes no other field', () => {
    const { mirror } = setup();
    const before = get(mirror).robot.settled;
    mirror.observe({ speed: 1 });
    expect(get(mirror).robot.settled).toEqual({ ...before, speed: 1 });
    expect(get(mirror).reported).toEqual({ speed: true });

    mirror.observe({ obstacleAvoidance: false });
    expect(get(mirror).robot.settled).toEqual({ ...before, speed: 1, obstacleAvoidance: false });
    expect(get(mirror).reported).toEqual({ speed: true, obstacleAvoidance: true });
  });

  it('changes nothing on a report that states nothing', () => {
    const { mirror } = setup();
    const before = get(mirror);
    mirror.observe({});
    expect(get(mirror)).toBe(before);
  });

  it('applies each of two reports stating the same gait', () => {
    const { mirror, confirm } = setup();
    mirror.observe({ gait: 'Backstand' });
    confirm(enter('Trotting'));
    expect(get(mirror).robot.settled.gait).toBe('Trotting');

    mirror.observe({ gait: 'Backstand' });
    expect(get(mirror).robot.settled.gait).toBe('Backstand');
  });

  it('does not re-apply an earlier gait report on a speed report, nor the reverse', () => {
    const { mirror, confirm } = setup();
    mirror.observe({ gait: 'Handstand' });
    confirm(enter('Trotting'));
    mirror.observe({ speed: -1 });
    expect(get(mirror).robot.settled).toMatchObject({ gait: 'Trotting', speed: -1 });

    confirm(set({ name: 'speed', value: 0 }));
    mirror.observe({ gait: 'Leaping' });
    expect(get(mirror).robot.settled).toMatchObject({ gait: 'Leaping', speed: 0 });
  });

  it('marks a posture report as reported, and keeps the gait', () => {
    const { mirror } = setup();
    mirror.observe({ gait: 'StaticWalk', posture: null });
    mirror.observe({ posture: 'Sitting' });
    expect(get(mirror).robot.settled).toMatchObject({ gait: 'StaticWalk', posture: 'Sitting' });
    expect(get(mirror).reported).toEqual({ gait: true, posture: true });
  });

  it('keeps the settled values but clears reported when the robot connection turns false', () => {
    const { mirror } = setup();
    mirror.observe({ speed: -1, obstacleAvoidance: true });
    const { settled } = get(mirror).robot;
    mirror.setRobotConnected(false);
    expect(get(mirror).robot.settled).toEqual(settled);
    expect(get(mirror).reported).toEqual({});
  });

  it('applies a report observed while the robot connection is false', () => {
    const { mirror } = setup();
    mirror.setRobotConnected(false);
    mirror.observe({ speed: 1 });
    expect(get(mirror).robot.settled.speed).toBe(1);
    expect(get(mirror).reported).toEqual({ speed: true });
  });

  it('sets previousGait to the old gait when a report changes the gait', () => {
    const { mirror, confirm } = setup();
    confirm(enter('Trotting'));
    mirror.observe({ gait: 'Stairs' });
    expect(get(mirror).robot.settled).toMatchObject({ gait: 'Stairs', previousGait: 'Trotting' });
    expect(get(mirror).reported).toEqual({ gait: true });
  });

  it('keeps previousGait when a report states the settled gait, or a posture', () => {
    const { mirror, confirm } = setup();
    confirm(enter('Trotting'));
    const { previousGait } = get(mirror).robot.settled;
    mirror.observe({ gait: 'Trotting' });
    mirror.observe({ posture: 'Sitting' });
    mirror.observe({ posture: null });
    expect(get(mirror).robot.settled).toMatchObject({ gait: 'Trotting', previousGait });
  });

  it('leaves a pending gait proposal pending', () => {
    const { mirror } = setup();
    const reqId = (lastReqId += 1);
    mirror.propose({ gait: 'Jumping' }, reqId);
    mirror.observe({ gait: 'CrossStep' });
    expect(get(mirror).robot.settled.gait).toBe('CrossStep');
    expect(get(mirror).robot.pending.gait).toBeDefined();
    expect(displayed(get(mirror).robot).gait).toBe('Jumping');
    mirror.resolve(reqId, { outcome: 'failed', code: null, detail: '', reqId, label: '', at: 0 });
    expect(get(mirror).robot.settled.gait).toBe('CrossStep');
  });
});
