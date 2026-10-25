import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { createRobot } from './robot';
import { lastOutcome, outcomeCounts, outcomeLog, recorded } from './outcomes';
import type { Outcome } from './outcomes';
import { enter, leave, perform, sequence, set, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { displayed } from '../utils/confirmable';

// The relay bounds every command at 5s.
const RELAY_WORST_CASE_MS = 5_000;
const BACKSTOP_MS = 20_000;

const OPEN = 1;
const CLOSED = 3;

/** A socket that records what the store writes, so no relay and no network are involved. The store
 * sets the handlers on connect, so a test plays the relay through them. */
class FakeSocket {
    readyState = OPEN;
    frames: string[] = [];
    throwOnSend = false;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onmessage: ((_event: { data: string }) => void) | null = null;

    send(data: string) {
        if (this.throwOnSend) throw new Error('socket is gone');
        this.frames.push(data);
    }

    /** What the store wrote, parsed. */
    get written(): Record<string, unknown>[] {
        return this.frames.map((frame) => JSON.parse(frame));
    }

    /** Delivers `_data` as a message from the relay. */
    receive(_data: string) {
        this.onmessage?.({ data: _data });
    }

    /** The request id of frame `_index`. */
    reqId(_index = 0): number {
        const reqId = this.written[_index].reqId;
        if (typeof reqId !== 'number') throw new Error(`frame ${_index} carries no numeric reqId`);
        return reqId;
    }
}

const HELLO = perform('Hello');

const DANCE = sequence('Dance', HELLO);

const verdict = (reqId: number, outcome: string, code: number | null, detail = 'because') =>
    JSON.stringify({ type: 'command_result', reqId, outcome, code, detail });

const robotState = (connected: boolean) => JSON.stringify({ type: 'robot_state', connected });

/** A robot whose channel is open on a fake socket. Its outcome log is `_log`, by default one no
 * other test writes, so a test that reads it depends on no earlier test. */
const openRobot = (_log = writable<Outcome[]>([])) => {
    const socket = new FakeSocket();
    const robot = createRobot({ openSocket: () => socket, outcomeLog: _log });
    robot.connect();
    socket.onopen?.();
    return { robot, socket, log: _log };
};

describe('the store', () => {
    it('starts with the channel closed, no robot, nothing told, and the robot settled on its boot state', () => {
        expect(get(createRobot({ openSocket: () => new FakeSocket(), outcomeLog: writable([]) }))).toEqual({
            channelOpen: false,
            robotConnected: false,
            lidarOn: false,
            monitoringOn: false,
            state: {
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
        const { robot, socket } = openRobot();
        socket.receive(robotState(true));
        robot.setLidar(true);
        robot.setMonitoring(true);
        expect(get(robot)).toMatchObject({
            channelOpen: true,
            robotConnected: true,
            lidarOn: true,
            monitoringOn: true,
        });
    });

    it('opens one socket while the channel is open, and another once it closes', () => {
        const opened: FakeSocket[] = [];
        const openSocket = () => {
            const socket = new FakeSocket();
            opened.push(socket);
            return socket;
        };
        const robot = createRobot({ openSocket, outcomeLog: writable([]) });
        robot.connect();
        robot.connect();
        expect(opened).toHaveLength(1);
        opened[0].readyState = CLOSED;
        robot.connect();
        expect(opened).toHaveLength(2);
    });
});

describe('connectRobot and disconnectRobot', () => {
    it('write their message when the socket is open', () => {
        const { robot, socket } = openRobot();
        robot.connectRobot('192.168.123.161');
        robot.disconnectRobot();
        expect(socket.written).toEqual([
            { command_name: 'connect', ip: '192.168.123.161' },
            { command_name: 'disconnect' },
        ]);
    });

    it('write nothing, and do not throw, when the socket is closed', () => {
        const { robot, socket } = openRobot();
        socket.readyState = CLOSED;
        expect(() => robot.connectRobot('192.168.123.161')).not.toThrow();
        expect(socket.frames).toEqual([]);
    });

    it('do not throw when the socket itself throws', () => {
        const { robot, socket } = openRobot();
        socket.throwOnSend = true;
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => robot.disconnectRobot()).not.toThrow();
        expect(error).toHaveBeenCalledOnce();
        error.mockRestore();
    });
});

describe.each([
    ['setLidar', 'lidar', 'lidarOn'],
    ['setMonitoring', 'subscribe', 'monitoringOn'],
] as const)('%s', (_method, _commandName, _flag) => {
    it('sends the switch and records it once the message has left the browser', () => {
        const { robot, socket } = openRobot();
        robot[_method](true);
        expect(socket.written).toEqual([{ command_name: _commandName, switch: true }]);
        expect(get(robot)[_flag]).toBe(true);
        robot[_method](false);
        expect(socket.written[1]).toEqual({ command_name: _commandName, switch: false });
        expect(get(robot)[_flag]).toBe(false);
    });

    it('keeps the flag when the channel is closed', () => {
        const { robot, socket } = openRobot();
        socket.readyState = CLOSED;
        robot[_method](true);
        expect(socket.frames).toEqual([]);
        expect(get(robot)[_flag]).toBe(false);
    });
});

describe('request', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('sends the cue as one sequence of its steps, named by its label and tagged with a request id', async () => {
        const { robot, socket } = openRobot();
        const answer = robot.request(HELLO);
        expect(socket.written[0]).toEqual({
            kind: 'sequence',
            command_name: 'Hello',
            sequence: HELLO.steps,
            reqId: expect.any(Number),
        });
        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        expect((await answer).reqId).toBe(socket.reqId());
    });

    it('gives each command its own request id', async () => {
        const { robot, socket } = openRobot();
        const first = robot.request(HELLO);
        const second = robot.request(HELLO);
        expect(socket.reqId(0)).not.toBe(socket.reqId(1));

        socket.receive(verdict(socket.reqId(0), 'confirmed', 0));
        socket.receive(verdict(socket.reqId(1), 'failed', 3203));
        expect((await first).outcome).toBe('confirmed');
        expect((await second).outcome).toBe('failed');
    });

    it('resolves confirmed for a result carrying code 0', async () => {
        const { robot, socket } = openRobot();
        const answer = robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        expect(await answer).toMatchObject({
            outcome: 'confirmed',
            code: 0,
            detail: 'because',
            reqId: socket.reqId(),
            label: 'Hello',
        });
    });

    it('resolves failed for a result carrying a non-zero code', async () => {
        const { robot, socket } = openRobot();
        const answer = robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'failed', 3203));
        expect(await answer).toMatchObject({ outcome: 'failed', code: 3203, detail: 'because' });
    });

    it('reads a result that carries no detail as an empty detail', async () => {
        const { robot, socket } = openRobot();
        const answer = robot.request(HELLO);
        socket.receive(
            JSON.stringify({
                type: 'command_result',
                reqId: socket.reqId(),
                outcome: 'confirmed',
                code: 0,
                detail: null,
            }),
        );
        expect((await answer).detail).toBe('');
    });

    it('resolves rejected when the bridge turned the request away', async () => {
        const { robot, socket } = openRobot();
        const answer = robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'rejected', null));
        expect((await answer).outcome).toBe('rejected');
    });

    it('reads a result whose outcome it does not recognise as unknown', async () => {
        const { robot, socket } = openRobot();
        const answer = robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'pirouette', 0));
        expect((await answer).outcome).toBe('unknown');
    });

    it('matches each verdict to its own request when they arrive out of order', async () => {
        const { robot, socket } = openRobot();
        const first = robot.request(HELLO);
        const second = robot.request(DANCE);

        socket.receive(verdict(socket.reqId(1), 'failed', 3203));
        socket.receive(verdict(socket.reqId(0), 'confirmed', 0));

        expect((await first).outcome).toBe('confirmed');
        expect((await second).outcome).toBe('failed');
    });

    it('resolves failed at once when the socket is closed, without waiting out the backstop', async () => {
        const { robot, socket } = openRobot();
        socket.readyState = CLOSED;
        const answer = await robot.request(HELLO);
        expect(answer).toMatchObject({ outcome: 'failed', label: 'Hello' });
        expect(socket.frames).toEqual([]);
    });

    it('resolves failed at once before the channel was ever opened', async () => {
        const robot = createRobot({ openSocket: () => new FakeSocket(), outcomeLog: writable([]) });
        expect((await robot.request(HELLO)).outcome).toBe('failed');
    });

    it('resolves failed when the socket itself throws', async () => {
        const { robot, socket } = openRobot();
        socket.throwOnSend = true;
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect((await robot.request(HELLO)).outcome).toBe('failed');
        error.mockRestore();
    });

    it('resolves unknown when no result arrives before the client-side timeout', async () => {
        vi.useFakeTimers();
        const { robot } = openRobot();
        const answer = robot.request(HELLO);
        await vi.advanceTimersByTimeAsync(BACKSTOP_MS + 1);
        expect(await answer).toMatchObject({ outcome: 'unknown', label: 'Hello' });
    });

    it('holds past the longest wait the relay itself can be in, so a slow command is not called unknown', async () => {
        vi.useFakeTimers();
        const { robot, socket } = openRobot();
        let settled = false;
        const answer = robot.request(HELLO).then((outcome) => {
            settled = true;
            return outcome;
        });

        await vi.advanceTimersByTimeAsync(RELAY_WORST_CASE_MS);
        expect(settled).toBe(false);

        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        expect((await answer).outcome).toBe('confirmed');
    });

    it('settles every waiting request when the control channel closes', async () => {
        const { robot, socket } = openRobot();
        const answer = robot.request(HELLO);
        const reqId = socket.reqId();
        socket.onclose?.();
        expect(await answer).toMatchObject({ outcome: 'failed', reqId, label: 'Hello' });
        expect(get(robot).robotConnected).toBe(false);
    });

    it('ignores a verdict that arrives after its request already settled', async () => {
        const { robot, socket, log } = openRobot();
        const answer = robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        expect((await answer).outcome).toBe('confirmed');

        socket.receive(verdict(socket.reqId(), 'failed', 3203));
        expect(get(log).map((entry) => entry.outcome)).toEqual(['failed', 'confirmed']);
    });
});

describe('the outcome log', () => {
    // `lastOutcome` and `outcomeCounts` derive from the app's log, so these robots write to it.
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('records the newest outcome first and keeps at most 200', () => {
        const outcome = (_reqId: number): Outcome => ({
            outcome: 'confirmed',
            code: 0,
            detail: '',
            reqId: _reqId,
            label: '',
            at: 0,
        });
        const full = Array.from({ length: 200 }, (_value, _index) => outcome(_index));
        const log = recorded(outcome(200))(full);
        expect(log).toHaveLength(200);
        expect(log[0].reqId).toBe(200);
        expect(log.at(-1)?.reqId).toBe(198);
    });

    it('labels an entry with the command the browser sent', () => {
        const { robot, socket } = openRobot(outcomeLog);
        void robot.request(DANCE);
        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        expect(get(lastOutcome)).toMatchObject({ label: 'Dance', outcome: 'confirmed', code: 0 });
    });

    it('drops a result that carries no request id, since this browser always sends one', () => {
        const { socket } = openRobot(outcomeLog);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(
            JSON.stringify({
                type: 'command_result',
                reqId: null,
                command_name: 'StandUp',
                outcome: 'failed',
                code: 3203,
                detail: 'status.code=3203',
            }),
        );
        expect(get(outcomeLog)).toEqual([]);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it('counts every outcome, and reports zero for the names nothing landed on', () => {
        const { robot, socket } = openRobot(outcomeLog);
        void robot.request(HELLO);
        void robot.request(HELLO);
        void robot.request(HELLO);
        socket.receive(verdict(socket.reqId(0), 'confirmed', 0));
        socket.receive(verdict(socket.reqId(1), 'failed', 3203));
        socket.receive(verdict(socket.reqId(2), 'rejected', null));

        expect(get(outcomeCounts)).toEqual({
            confirmed: 1,
            failed: 1,
            rejected: 1,
            unknown: 0,
        });
    });

    it('starts again when the control channel opens', () => {
        const { robot, socket } = openRobot(outcomeLog);
        void robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'failed', 3203));
        expect(get(outcomeLog)).toHaveLength(1);

        socket.onopen?.();
        expect(get(outcomeLog)).toEqual([]);
        expect(get(outcomeCounts)).toEqual({ confirmed: 0, failed: 0, rejected: 0, unknown: 0 });
        expect(get(lastOutcome)).toBeNull();
    });
});

describe('robot state', () => {
    it('follows every robot_state the relay sends, not only the first', () => {
        const { robot, socket } = openRobot();
        socket.receive(robotState(false));
        expect(get(robot).robotConnected).toBe(false);

        socket.receive(robotState(true));
        expect(get(robot).robotConnected).toBe(true);

        socket.receive(robotState(false));
        expect(get(robot).robotConnected).toBe(false);
    });

    it('drops a frame it cannot read without disturbing what it already knows', () => {
        const { robot, socket } = openRobot();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(robotState(true));
        socket.receive('{ this is not json');
        expect(get(robot).robotConnected).toBe(true);
        warn.mockRestore();
    });

    it('ignores JSON that is not a relay message', () => {
        const { robot, socket, log } = openRobot();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(robotState(true));
        socket.receive('null');
        socket.receive(JSON.stringify({ type: 'pirouette', connected: false }));
        expect(get(robot).robotConnected).toBe(true);
        expect(get(log)).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});

const settings = (speedLevel: unknown, obstacleAvoidance: unknown) =>
    JSON.stringify({ type: 'robot_settings', speedLevel, obstacleAvoidance });

const sportState = (errorCode: number | null, motionMode: string | null = 'mcf') =>
    JSON.stringify({ type: 'sport_state', motionMode, mode: 0, errorCode });

/** A robot that is up, with a fresh log. Nothing the robot stated before counts as reported. */
const connectedRobot = () => {
    const opened = openRobot();
    const { robot, socket } = opened;
    socket.receive(robotState(false));
    socket.receive(robotState(true));
    /** Answers request `_index`, by default the latest, with `_outcome`, as the relay would. */
    const reply = (_outcome: Outcome['outcome'], _index = socket.frames.length - 1) =>
        socket.receive(verdict(socket.reqId(_index), _outcome, null));
    /** Settles `_cue` by answering its request with a confirmation. */
    const confirm = (_cue: Cue) => {
        const answer = robot.request(_cue);
        reply('confirmed');
        return answer;
    };
    return { ...opened, reply, confirm };
};

describe("the robot's report", () => {
    it('starts with no field reported', () => {
        const { robot } = connectedRobot();
        expect(get(robot).reported).toEqual({});
    });

    it('applies exactly the fields a report states, and changes no other field', () => {
        const { robot, socket } = connectedRobot();
        const before = get(robot).state.settled;
        socket.receive(settings(1, null));
        expect(get(robot).state.settled).toEqual({ ...before, speed: 1 });
        expect(get(robot).reported).toEqual({ speed: true });

        socket.receive(settings(1, false));
        expect(get(robot).state.settled).toEqual({ ...before, speed: 1, obstacleAvoidance: false });
        expect(get(robot).reported).toEqual({ speed: true, obstacleAvoidance: true });
    });

    it('applies a report received while the robot connection is false', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(robotState(false));
        socket.receive(settings(1, null));
        expect(get(robot).state.settled.speed).toBe(1);
        expect(get(robot).reported).toEqual({ speed: true });
    });

    it('sets previousGait to the old gait when a report changes the gait', async () => {
        const { robot, socket, confirm } = connectedRobot();
        await confirm(enter('Trotting'));
        socket.receive(sportState(2010));
        expect(get(robot).state.settled).toMatchObject({ gait: 'Stairs', previousGait: 'Trotting' });
        expect(get(robot).reported).toEqual({ gait: true, posture: true });
    });

    it('keeps previousGait when a report states the settled gait, or a posture', async () => {
        const { robot, socket, confirm } = connectedRobot();
        await confirm(enter('Trotting'));
        const { previousGait } = get(robot).state.settled;
        socket.receive(sportState(1016));
        socket.receive(sportState(1007));
        socket.receive(sportState(1013));
        expect(get(robot).state.settled).toMatchObject({ gait: 'Trotting', previousGait });
    });
});

describe('robot settings', () => {
    it.each([-1, 0, 1])('reports speed level %i, and only the speed', (level) => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(level, null));
        expect(get(robot).state.settled.speed).toBe(level);
        expect(get(robot).reported).toEqual({ speed: true });
    });

    it.each([2, null])('states no speed for level %s, and warns', (level) => {
        const { robot, socket } = connectedRobot();
        const speed = get(robot).state.settled.speed;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        socket.receive(settings(level, true));

        expect(get(robot).state.settled.speed).toBe(speed);
        expect(get(robot).reported).toEqual({ obstacleAvoidance: true });
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it.each([null, 'yes', 1])('states no obstacle avoidance for %s', (value) => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(0, value));
        expect(get(robot).reported).toEqual({ speed: true });
    });

    it('reports obstacle avoidance', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(0, false));
        expect(get(robot).state.settled.obstacleAvoidance).toBe(false);
        expect(get(robot).reported).toEqual({ speed: true, obstacleAvoidance: true });

        socket.receive(settings(0, true));
        expect(get(robot).state.settled.obstacleAvoidance).toBe(true);
    });

    it('leaves the store unchanged on a frame that states nothing', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(-1, null));
        const before = get(robot);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(settings(2, 'yes'));
        socket.receive(sportState(4242));
        expect(get(robot)).toBe(before);
        expect(get(robot).state.settled.speed).toBe(-1);
        expect(get(robot).reported).toEqual({ speed: true });
        warn.mockRestore();
    });

    it('does not re-apply an earlier gait report on a speed report', async () => {
        const { robot, socket, confirm } = connectedRobot();
        socket.receive(sportState(2017));
        await confirm(enter('Trotting'));
        socket.receive(settings(1, null));
        expect(get(robot).state.settled).toMatchObject({ gait: 'Trotting', speed: 1 });
    });

    it('keeps the settled values but clears reported when the robot is lost', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(-1, true));
        const { settled } = get(robot).state;
        socket.receive(robotState(false));
        expect(get(robot).state.settled).toEqual(settled);
        expect(get(robot).reported).toEqual({});
    });

    it('keeps reported while the robot stays connected', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(0, true));
        socket.receive(robotState(true));
        expect(get(robot).reported).toEqual({ speed: true, obstacleAvoidance: true });
    });

    it('clears reported when the control channel closes', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(0, true));
        socket.onclose?.();
        expect(get(robot).reported).toEqual({});
    });
});

describe('sport_state report', () => {
    it('reports Leaping on code 2008 under mcf, and no posture', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(sportState(2008));
        expect(get(robot).state.settled).toMatchObject({ gait: 'Leaping', posture: null });
        expect(get(robot).reported).toEqual({ gait: true, posture: true });
    });

    it.each([
        [1001, 'Damp'],
        [1002, 'JointLock'],
        [1004, 'Lying'],
        [1007, 'Sitting'],
        [1091, 'Pose'],
    ])('reports code %i as the posture %s, and keeps the gait', (_code, _posture) => {
        const { robot, socket } = connectedRobot();
        socket.receive(sportState(2017));
        socket.receive(sportState(_code));
        expect(get(robot).state.settled).toMatchObject({ gait: 'Backstand', posture: _posture });
        expect(get(robot).reported).toEqual({ gait: true, posture: true });
    });

    it('keeps the gait and clears the posture on code 1013', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(sportState(1015));
        socket.receive(sportState(1007));
        socket.receive(sportState(1013));
        expect(get(robot).state.settled).toMatchObject({ gait: 'StaticWalk', posture: null });
    });

    it.each([
        ['the transient code 1005', 1005, 'mcf'],
        ['the transient code 1006', 1006, 'mcf'],
        ['no code', null, 'mcf'],
        ['a motion-control mode other than mcf', 2008, 'normal'],
        ['an unread motion-control mode', 2008, null],
    ])('states nothing on %s, and warns of nothing', (_case, _code, _motionMode) => {
        const { robot, socket } = connectedRobot();
        socket.receive(sportState(1016));
        socket.receive(sportState(1004));
        const before = get(robot);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(sportState(_code, _motionMode));
        expect(get(robot)).toBe(before);
        expect(get(robot).state.settled).toMatchObject({ gait: 'Trotting', posture: 'Lying' });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('changes nothing on an unknown code, and warns once per code', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(sportState(1016));
        const before = get(robot);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(sportState(9001));
        socket.receive(sportState(9001));
        expect(get(robot)).toBe(before);
        expect(warn).toHaveBeenCalledOnce();

        socket.receive(sportState(9002));
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('applies each of two reports stating the same gait', async () => {
        const { robot, socket, confirm } = connectedRobot();
        socket.receive(sportState(2017));
        expect(get(robot).state.settled.gait).toBe('Backstand');

        await confirm(enter('Trotting'));
        expect(get(robot).state.settled.gait).toBe('Trotting');

        socket.receive(sportState(2017));
        expect(get(robot).state.settled.gait).toBe('Backstand');
    });

    it('does not re-apply an earlier speed report on a gait report', async () => {
        const { robot, socket, confirm } = connectedRobot();
        socket.receive(settings(-1, null));
        await confirm(set({ name: 'speed', value: 1 }));
        socket.receive(sportState(2008));
        expect(get(robot).state.settled).toMatchObject({ gait: 'Leaping', speed: 1 });
    });

    it('leaves a pending gait proposal pending, which a confirmation then settles', async () => {
        const { robot, socket } = connectedRobot();
        const done = robot.request(enter('Jumping'));
        socket.receive(sportState(2011));
        expect(get(robot).state.settled.gait).toBe('Handstand');
        expect(get(robot).state.pending.gait).toEqual({ value: 'Jumping', reqId: socket.reqId() });

        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        await done;
        expect(get(robot).state.settled.gait).toBe('Jumping');
    });

    it('leaves a pending gait proposal displayed, and a refusal keeps the reported gait', async () => {
        const { robot, socket, reply } = connectedRobot();
        const done = robot.request(enter('Jumping'));
        socket.receive(sportState(2016));
        expect(get(robot).state.settled.gait).toBe('CrossStep');
        expect(displayed(get(robot).state).gait).toBe('Jumping');
        reply('failed');
        await done;
        expect(get(robot).state.settled.gait).toBe('CrossStep');
    });
});

const SABOTS = sequence(
    'Sabots',
    enter('FreeWalk'),
    wait(0.1),
    enter('Backstand'),
    wait(0.1),
    set({ name: 'headlight', value: 'blue' }),
);

describe('request and the robot state', () => {
    it('proposes under the request id the store sent to the relay', async () => {
        const { robot, socket, reply } = connectedRobot();
        const answer = robot.request(set({ name: 'headlight', value: 'red' }));
        expect(get(robot).state.pending.headlight?.reqId).toBe(socket.reqId());

        reply('confirmed');
        await answer;
        expect(get(robot).state.pending).toEqual({});
    });

    it('proposes each field a cue changes, and a confirmation settles them', async () => {
        const { robot, socket, reply } = connectedRobot();
        const answer = robot.request(SABOTS);

        expect(socket.written).toEqual([expect.objectContaining({ command_name: 'Sabots', sequence: SABOTS.steps })]);
        // previousGait goes from FreeWalk to FreeWalk, so it is not proposed.
        expect(get(robot).state.pending).toEqual({
            gait: { value: 'Backstand', reqId: expect.any(Number) },
            headlight: { value: 'blue', reqId: expect.any(Number) },
        });

        reply('confirmed');
        expect((await answer).outcome).toBe('confirmed');
        expect(get(robot).state.settled).toMatchObject({ gait: 'Backstand', headlight: 'blue' });
        expect(get(robot).state.pending).toEqual({});
    });

    it('proposes only the fields whose value differs from the displayed one', async () => {
        const { robot, reply, confirm } = connectedRobot();
        await confirm(set({ name: 'headlight', value: 'blue' }));
        // The headlight is already blue, so only the gait is proposed.
        const answer = robot.request(sequence('', enter('Trotting'), set({ name: 'headlight', value: 'blue' })));
        expect(get(robot).state.pending.gait).toBeDefined();
        expect(get(robot).state.pending.headlight).toBeUndefined();
        reply('confirmed');
        await answer;
    });

    it.each(['failed', 'rejected', 'unknown'] as const)('keeps the settled state on %s', async (_outcome) => {
        const { robot, reply } = connectedRobot();
        const before = get(robot).state.settled;
        const answer = robot.request(sequence('', enter('ClassicWalk'), set({ name: 'headlight', value: 'green' })));
        expect(displayed(get(robot).state)).toMatchObject({ gait: 'ClassicWalk', headlight: 'green' });

        reply(_outcome);
        await answer;
        expect(get(robot).state.settled).toEqual(before);
        expect(displayed(get(robot).state)).toEqual(before);
        expect(get(robot).state.pending).toEqual({});
    });

    it('proposes nothing for a cue that changes no tracked field, and still sends it', async () => {
        const { robot, socket, reply } = connectedRobot();
        const before = get(robot).state;
        const answer = robot.request(HELLO);
        expect(socket.written).toEqual([expect.objectContaining({ command_name: 'Hello' })]);
        expect(get(robot).state).toBe(before);
        reply('failed');
        await answer;
        expect(get(robot).state).toBe(before);
    });

    it('proposes nothing for a click on the value already displayed, and still sends it', async () => {
        const { robot, socket, reply } = connectedRobot();
        const cue = set({ name: 'headlight', value: displayed(get(robot).state).headlight });
        const before = get(robot).state;
        const answer = robot.request(cue);
        expect(socket.written).toEqual([expect.objectContaining({ command_name: cue.label, sequence: cue.steps })]);
        expect(get(robot).state).toBe(before);
        reply('confirmed');
        expect((await answer).outcome).toBe('confirmed');
        expect(get(robot).state).toBe(before);
    });

    it('proposes nothing when the channel is closed, and resolves failed', async () => {
        const { robot, socket } = connectedRobot();
        socket.readyState = CLOSED;
        const before = get(robot).state;
        const answer = robot.request(enter('Trotting'));
        expect(get(robot).state).toBe(before);
        expect((await answer).outcome).toBe('failed');
        expect(get(robot).state).toBe(before);
    });

    it('sets obstacle avoidance and settles it on confirmation', async () => {
        const { robot, reply } = connectedRobot();
        const answer = robot.request(set({ name: 'obstacleAvoidance', value: false }));
        expect(get(robot).state.pending.obstacleAvoidance?.value).toBe(false);
        reply('confirmed');
        await answer;
        expect(get(robot).state.settled.obstacleAvoidance).toBe(false);
    });

    it('keeps two cues on different fields pending side by side, each settled by its own verdict', async () => {
        const { robot, reply } = connectedRobot();
        const { gait } = get(robot).state.settled;
        const first = robot.request(enter('Trotting'));
        const second = robot.request(enter('Sitting'));
        expect(displayed(get(robot).state)).toMatchObject({ gait: 'Trotting', posture: 'Sitting' });

        reply('failed', 0);
        await first;
        expect(get(robot).state.settled.gait).toBe(gait);
        expect(get(robot).state.pending.gait).toBeUndefined();
        expect(get(robot).state.pending.posture).toBeDefined();

        reply('confirmed', 1);
        await second;
        expect(get(robot).state.settled).toMatchObject({ gait, posture: 'Sitting' });
    });

    it('lets a second cue on the same field replace the first, whose verdict then changes nothing', async () => {
        const { robot, reply } = connectedRobot();
        const { gait } = get(robot).state.settled;
        const first = robot.request(enter('Pose'));
        const second = robot.request(enter('Jumping'));
        expect(displayed(get(robot).state)).toMatchObject({ gait: 'Jumping', posture: null });

        const before = get(robot).state;
        reply('confirmed', 0);
        await first;
        expect(get(robot).state).toBe(before);

        reply('failed', 1);
        await second;
        expect(get(robot).state.settled.gait).toBe(gait);
    });

    it('keeps the gait on entering Pose', async () => {
        const { robot, reply, confirm } = connectedRobot();
        await confirm(enter('Backstand'));
        const answer = robot.request(enter('Pose'));
        expect(get(robot).state.pending).toEqual({ posture: { value: 'Pose', reqId: expect.any(Number) } });
        reply('confirmed');
        await answer;
        expect(get(robot).state.settled).toMatchObject({ gait: 'Backstand', posture: 'Pose' });
    });

    it('leaves the gait as it was before Sit, and no posture, after Sit then RiseSit', async () => {
        const { robot, reply, confirm } = connectedRobot();
        await confirm(enter('EconomicGait'));
        await confirm(enter('Sitting'));
        expect(get(robot).state.settled).toMatchObject({ gait: 'EconomicGait', posture: 'Sitting' });
        const answer = robot.request(leave('Sitting'));
        expect(get(robot).state.pending).toEqual({ posture: { value: null, reqId: expect.any(Number) } });
        reply('confirmed');
        await answer;
        expect(get(robot).state.settled).toMatchObject({ gait: 'EconomicGait', posture: null });
    });

    it('proposes the old gait as previousGait when a cue changes the gait', async () => {
        const { robot, reply, confirm } = connectedRobot();
        await confirm(enter('StaticWalk'));
        const answer = robot.request(enter('Leaping'));
        expect(get(robot).state.pending).toEqual({
            gait: { value: 'Leaping', reqId: expect.any(Number) },
            previousGait: { value: 'StaticWalk', reqId: expect.any(Number) },
        });
        reply('confirmed');
        await answer;
        expect(get(robot).state.settled).toMatchObject({ gait: 'Leaping', previousGait: 'StaticWalk' });
    });

    it('keeps previousGait on entering and leaving a posture', async () => {
        const { robot, reply } = connectedRobot();
        const { previousGait } = get(robot).state.settled;
        for (const cue of [enter('Pose'), leave('Pose'), enter('Sitting'), leave('Sitting')]) {
            const answer = robot.request(cue);
            expect(get(robot).state.pending.previousGait).toBeUndefined();
            reply('confirmed');
            await answer;
            expect(get(robot).state.settled.previousGait).toBe(previousGait);
        }
    });
});
