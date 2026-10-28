import { beforeEach, describe, expect, it, vi } from 'vitest';
import { map, omit, prop, range, reverse, times } from 'remeda';
import { Robot } from './robot.svelte';
import { LISTS, OutcomeLog } from './outcomes.svelte';
import type { Outcome } from './outcomes.svelte';
import { enter, leave, perform, recover, sequence, set, wait } from '../utils/commands';
import type { Cue, RobotState } from '../utils/commands';
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
    onmessage: ((_event: { data: string | Blob }) => void) | null = null;

    send(data: string) {
        if (this.throwOnSend) throw new Error('socket is gone');
        this.frames.push(data);
    }

    /** What the store wrote, parsed. */
    get written(): Record<string, unknown>[] {
        return this.frames.map((frame) => JSON.parse(frame));
    }

    /** Delivers `_data` as a message from the relay: JSON as a string, a video frame as a Blob. */
    receive(_data: string | Blob) {
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

/** A robot whose channel is open on a fake socket. Its outcome log is one no other test writes, so
 * a test that reads it depends on no earlier test. */
const openRobot = () => {
    const socket = new FakeSocket();
    const log = new OutcomeLog();
    const robot = new Robot({ openSocket: () => socket, outcomeLog: log });
    robot.connect();
    socket.onopen?.();
    return { robot, socket, log };
};

describe('the store', () => {
    it('starts with the channel closed, no robot, nothing told, and the robot settled on its boot state', () => {
        const robot = new Robot({ openSocket: () => new FakeSocket(), outcomeLog: new OutcomeLog() });
        // @ts-expect-error: only the robot's own methods write its state, so it exposes no `update`.
        expect(robot.update).toBeUndefined();
        // @ts-expect-error: `current` has a getter and no setter.
        expect(() => (robot.current = robot.current)).toThrow(TypeError);
        expect(robot.current).toEqual({
            channelOpen: false,
            robotConnected: false,
            lidarOn: false,
            state: {
                settled: {
                    gait: 'FreeWalk',
                    posture: null,
                    headlight: 'green',
                    speed: 0,
                    obstacleAvoidance: true,
                },
                pending: {},
            },
            reported: {},
            previous: { gait: 'FreeWalk', headlight: 'green' },
        });
    });

    it('shows each decoded video frame and closes the one it replaces', async () => {
        const [first, second] = times(2, () => ({ close: vi.fn() }));
        vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second));
        const { robot, socket } = openRobot();
        socket.receive(new Blob());
        await vi.waitFor(() => expect(robot.frame).toBe(first));
        socket.receive(new Blob());
        await vi.waitFor(() => expect(robot.frame).toBe(second));
        expect(first.close).toHaveBeenCalledOnce();
        expect(second.close).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('records each flag it is given', () => {
        const { robot, socket } = openRobot();
        socket.receive(robotState(true));
        robot.setLidar(true);
        expect(robot.current).toMatchObject({
            channelOpen: true,
            robotConnected: true,
            lidarOn: true,
        });
    });

    it('opens one socket while the channel is open, and another once it closes', () => {
        const opened: FakeSocket[] = [];
        const openSocket = () => {
            const socket = new FakeSocket();
            opened.push(socket);
            return socket;
        };
        const robot = new Robot({ openSocket, outcomeLog: new OutcomeLog() });
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

describe('setLidar', () => {
    it('sends the switch and records it once the message has left the browser', () => {
        const { robot, socket } = openRobot();
        robot.setLidar(true);
        expect(socket.written).toEqual([{ command_name: 'lidar', switch: true }]);
        expect(robot.current.lidarOn).toBe(true);
        robot.setLidar(false);
        expect(socket.written[1]).toEqual({ command_name: 'lidar', switch: false });
        expect(robot.current.lidarOn).toBe(false);
    });

    it('keeps the flag when the channel is closed', () => {
        const { robot, socket } = openRobot();
        socket.readyState = CLOSED;
        robot.setLidar(true);
        expect(socket.frames).toEqual([]);
        expect(robot.current.lidarOn).toBe(false);
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
        const robot = new Robot({ openSocket: () => new FakeSocket(), outcomeLog: new OutcomeLog() });
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
        expect(robot.current.robotConnected).toBe(false);
    });

    it('ignores a verdict that arrives after its request already settled', async () => {
        const { robot, socket, log } = openRobot();
        const answer = robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        expect((await answer).outcome).toBe('confirmed');

        socket.receive(verdict(socket.reqId(), 'failed', 3203));
        expect(map(log.entries, prop('outcome'))).toEqual(['failed', 'confirmed']);
    });
});

describe('the outcome log', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('records the newest outcome first and keeps at most 200', () => {
        const log = new OutcomeLog();
        times(201, (_reqId) =>
            log.record({ outcome: 'confirmed', code: 0, detail: '', reqId: _reqId, label: '', at: 0 }),
        );
        expect(map(log.entries, prop('reqId'))).toEqual(reverse(range(1, 201)));
    });

    it('labels an entry with the command the browser sent', () => {
        const { robot, socket, log } = openRobot();
        void robot.request(DANCE);
        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        expect(log.last).toMatchObject({ label: 'Dance', outcome: 'confirmed', code: 0 });
    });

    it('drops a result that carries no request id, since this browser always sends one', () => {
        const { socket, log } = openRobot();
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
        expect(log.entries).toEqual([]);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it('counts every outcome, and reports zero for the names nothing landed on', () => {
        const { robot, socket, log } = openRobot();
        void robot.request(HELLO);
        void robot.request(HELLO);
        void robot.request(HELLO);
        socket.receive(verdict(socket.reqId(0), 'confirmed', 0));
        socket.receive(verdict(socket.reqId(1), 'failed', 3203));
        socket.receive(verdict(socket.reqId(2), 'rejected', null));

        expect(log.counts).toEqual({
            confirmed: 1,
            failed: 1,
            rejected: 1,
            unknown: 0,
        });
    });

    it('starts again when the control channel opens', () => {
        const { robot, socket, log } = openRobot();
        void robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'failed', 3203));
        expect(log.entries).toHaveLength(1);

        socket.onopen?.();
        expect(log.entries).toEqual([]);
        expect(log.counts).toEqual({ confirmed: 0, failed: 0, rejected: 0, unknown: 0 });
        expect(log.last).toBeNull();
        expect(log.messages).toEqual({ sent: [], received: [], stream: [] });
    });
});

const stateStream = JSON.stringify({ type: 'state_stream', data: { mode: 1 } });

describe('the message log', () => {
    it('logs a request as sent, and its verdict as received under the label of the request it answers', () => {
        const { robot, socket, log } = openRobot();
        void robot.request(DANCE);
        // The verdict carries no command name, so only the awaited request can name it.
        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        const detail = JSON.stringify(omit(socket.written[0], ['command_name']));
        expect(log.messages.sent).toMatchObject([{ kind: 'sent', summary: 'Dance', detail }]);
        expect(log.messages.received).toMatchObject([{ kind: 'received', summary: 'Dance confirmed (0)' }]);
    });

    it('logs connect and disconnect as sent', () => {
        const { robot, log } = openRobot();
        robot.connectRobot('192.168.123.161');
        robot.disconnectRobot();
        expect(map(log.messages.sent, prop('summary'))).toEqual(['disconnect', 'connect']);
    });

    it('logs nothing as sent when the message never left the browser', async () => {
        const { robot, socket, log } = openRobot();
        socket.readyState = CLOSED;
        await robot.request(HELLO);
        expect(log.messages.sent).toEqual([]);
    });

    it('logs a robot_state as received under its type, and a state_stream as stream with only its data', () => {
        const { socket, log } = openRobot();
        socket.receive(robotState(true));
        socket.receive(stateStream);
        expect(log.messages).toMatchObject({
            sent: [],
            received: [{ kind: 'received', summary: 'robot_state', detail: '{"connected":true}' }],
            stream: [{ kind: 'stream', summary: '', detail: '{"mode":1}' }],
        });
    });

    it('logs a frame that is not JSON as received', () => {
        const { socket, log } = openRobot();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive('{ this is not json');
        expect(log.messages.received).toMatchObject([{ summary: 'not a relay message', detail: '{ this is not json' }]);
        warn.mockRestore();
    });

    it('keeps the newest stream messages up to their own limit, and leaves the other lists untouched', () => {
        const { robot, socket, log } = openRobot();
        void robot.request(HELLO);
        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        const { sent, received } = log.messages;
        times(LISTS.stream.limit + 1, () => socket.receive(stateStream));
        expect(log.messages.stream).toHaveLength(LISTS.stream.limit);
        expect(log.messages.sent).toBe(sent);
        expect(log.messages.received).toBe(received);
    });

    it('counts only the verdicts', () => {
        const { robot, socket, log } = openRobot();
        robot.connectRobot('192.168.123.161');
        socket.receive(robotState(true));
        socket.receive(stateStream);
        void robot.request(HELLO);
        socket.receive(verdict(socket.reqId(1), 'failed', 3203));
        expect(log.entries).toHaveLength(1);
        expect(log.counts).toEqual({ confirmed: 0, failed: 1, rejected: 0, unknown: 0 });
    });
});

describe('robot state', () => {
    it('follows every robot_state the relay sends, not only the first', () => {
        const { robot, socket } = openRobot();
        socket.receive(robotState(false));
        expect(robot.current.robotConnected).toBe(false);

        socket.receive(robotState(true));
        expect(robot.current.robotConnected).toBe(true);

        socket.receive(robotState(false));
        expect(robot.current.robotConnected).toBe(false);
    });

    it('drops a frame it cannot read without disturbing what it already knows', () => {
        const { robot, socket } = openRobot();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(robotState(true));
        socket.receive('{ this is not json');
        expect(robot.current.robotConnected).toBe(true);
        warn.mockRestore();
    });

    it('ignores JSON that is not a relay message', () => {
        const { robot, socket, log } = openRobot();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(robotState(true));
        socket.receive('null');
        socket.receive(JSON.stringify({ type: 'pirouette', connected: false }));
        expect(robot.current.robotConnected).toBe(true);
        expect(log.entries).toEqual([]);
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
        expect(robot.current.reported).toEqual({});
    });

    it('applies exactly the fields a report states, and changes no other field', () => {
        const { robot, socket } = connectedRobot();
        const before = robot.current.state.settled;
        socket.receive(settings(1, null));
        expect(robot.current.state.settled).toEqual({ ...before, speed: 1 });
        expect(robot.current.reported).toEqual({ speed: true });

        socket.receive(settings(1, false));
        expect(robot.current.state.settled).toEqual({ ...before, speed: 1, obstacleAvoidance: false });
        expect(robot.current.reported).toEqual({ speed: true, obstacleAvoidance: true });
    });

    it('applies a report received while the robot connection is false', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(robotState(false));
        socket.receive(settings(1, null));
        expect(robot.current.state.settled.speed).toBe(1);
        expect(robot.current.reported).toEqual({ speed: true });
    });

    it('sets the previous gait to the old gait when a report changes the gait', async () => {
        const { robot, socket, confirm } = connectedRobot();
        await confirm(enter('Running'));
        socket.receive(sportState(2010));
        expect(robot.current).toMatchObject({ state: { settled: { gait: 'Stairs' } }, previous: { gait: 'Running' } });
        expect(robot.current.reported).toEqual({ gait: true, posture: true });
    });

    it('keeps the previous gait when a report states the settled gait, or a posture', async () => {
        const { robot, socket, confirm } = connectedRobot();
        await confirm(enter('Running'));
        const { gait: before } = robot.current.previous;
        socket.receive(sportState(1016));
        socket.receive(sportState(1007));
        socket.receive(sportState(1013));
        expect(robot.current).toMatchObject({ state: { settled: { gait: 'Running' } }, previous: { gait: before } });
    });
});

describe('robot settings', () => {
    it.each([-1, 0, 1])('reports speed level %i, and only the speed', (level) => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(level, null));
        expect(robot.current.state.settled.speed).toBe(level);
        expect(robot.current.reported).toEqual({ speed: true });
    });

    it.each([2, null])('states no speed for level %s, and warns', (level) => {
        const { robot, socket } = connectedRobot();
        const speed = robot.current.state.settled.speed;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        socket.receive(settings(level, true));

        expect(robot.current.state.settled.speed).toBe(speed);
        expect(robot.current.reported).toEqual({ obstacleAvoidance: true });
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it.each([null, 'yes', 1])('states no obstacle avoidance for %s', (value) => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(0, value));
        expect(robot.current.reported).toEqual({ speed: true });
    });

    it('reports obstacle avoidance', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(0, false));
        expect(robot.current.state.settled.obstacleAvoidance).toBe(false);
        expect(robot.current.reported).toEqual({ speed: true, obstacleAvoidance: true });

        socket.receive(settings(0, true));
        expect(robot.current.state.settled.obstacleAvoidance).toBe(true);
    });

    it('leaves the store unchanged on a frame that states nothing', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(-1, null));
        const before = robot.current;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(settings(2, 'yes'));
        socket.receive(sportState(4242));
        expect(robot.current).toBe(before);
        expect(robot.current.state.settled.speed).toBe(-1);
        expect(robot.current.reported).toEqual({ speed: true });
        warn.mockRestore();
    });

    it('does not re-apply an earlier gait report on a speed report', async () => {
        const { robot, socket, confirm } = connectedRobot();
        socket.receive(sportState(2017));
        await confirm(enter('Running'));
        socket.receive(settings(1, null));
        expect(robot.current.state.settled).toMatchObject({ gait: 'Running', speed: 1 });
    });

    it('keeps the settled values but clears reported when the robot is lost', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(-1, true));
        const { settled } = robot.current.state;
        socket.receive(robotState(false));
        expect(robot.current.state.settled).toEqual(settled);
        expect(robot.current.reported).toEqual({});
    });

    it('keeps reported while the robot stays connected', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(0, true));
        socket.receive(robotState(true));
        expect(robot.current.reported).toEqual({ speed: true, obstacleAvoidance: true });
    });

    it('clears reported when the control channel closes', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(settings(0, true));
        socket.onclose?.();
        expect(robot.current.reported).toEqual({});
    });
});

describe('sport_state report', () => {
    it('reports Bound on code 2008 under mcf, and no posture', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(sportState(2008));
        expect(robot.current.state.settled).toMatchObject({ gait: 'Bound', posture: null });
        expect(robot.current.reported).toEqual({ gait: true, posture: true });
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
        expect(robot.current.state.settled).toMatchObject({ gait: 'Backstand', posture: _posture });
        expect(robot.current.reported).toEqual({ gait: true, posture: true });
    });

    it('keeps the gait and clears the posture on code 1013', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(sportState(1015));
        socket.receive(sportState(1007));
        socket.receive(sportState(1013));
        expect(robot.current.state.settled).toMatchObject({ gait: 'StaticWalk', posture: null });
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
        const before = robot.current;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(sportState(_code, _motionMode));
        expect(robot.current).toBe(before);
        expect(robot.current.state.settled).toMatchObject({ gait: 'Running', posture: 'Lying' });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('changes nothing on an unknown code, and warns once per code', () => {
        const { robot, socket } = connectedRobot();
        socket.receive(sportState(1016));
        const before = robot.current;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        socket.receive(sportState(9001));
        socket.receive(sportState(9001));
        expect(robot.current).toBe(before);
        expect(warn).toHaveBeenCalledOnce();

        socket.receive(sportState(9002));
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('applies each of two reports stating the same gait', async () => {
        const { robot, socket, confirm } = connectedRobot();
        socket.receive(sportState(2017));
        expect(robot.current.state.settled.gait).toBe('Backstand');

        await confirm(enter('Running'));
        expect(robot.current.state.settled.gait).toBe('Running');

        socket.receive(sportState(2017));
        expect(robot.current.state.settled.gait).toBe('Backstand');
    });

    it('does not re-apply an earlier speed report on a gait report', async () => {
        const { robot, socket, confirm } = connectedRobot();
        socket.receive(settings(-1, null));
        await confirm(set({ name: 'speed', value: 1 }));
        socket.receive(sportState(2008));
        expect(robot.current.state.settled).toMatchObject({ gait: 'Bound', speed: 1 });
    });

    it('leaves a pending gait proposal pending, which a confirmation then settles', async () => {
        const { robot, socket } = connectedRobot();
        const done = robot.request(enter('Jumping'));
        socket.receive(sportState(2011));
        expect(robot.current.state.settled.gait).toBe('Handstand');
        expect(robot.current.state.pending.gait).toEqual({ value: 'Jumping', reqId: socket.reqId() });

        socket.receive(verdict(socket.reqId(), 'confirmed', 0));
        await done;
        expect(robot.current.state.settled.gait).toBe('Jumping');
    });

    it('leaves a pending gait proposal displayed, and a refusal keeps the reported gait', async () => {
        const { robot, socket, reply } = connectedRobot();
        const done = robot.request(enter('Jumping'));
        socket.receive(sportState(2016));
        expect(robot.current.state.settled.gait).toBe('CrossStep');
        expect(displayed(robot.current.state).gait).toBe('Jumping');
        reply('failed');
        await done;
        expect(robot.current.state.settled.gait).toBe('CrossStep');
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
        expect(robot.current.state.pending.headlight?.reqId).toBe(socket.reqId());

        reply('confirmed');
        await answer;
        expect(robot.current.state.pending).toEqual({});
    });

    it('proposes each field a cue changes, and a confirmation settles them', async () => {
        const { robot, socket, reply } = connectedRobot();
        const answer = robot.request(SABOTS);

        expect(socket.written).toEqual([expect.objectContaining({ command_name: 'Sabots', sequence: SABOTS.steps })]);
        expect(robot.current.state.pending).toEqual({
            gait: { value: 'Backstand', reqId: expect.any(Number) },
            headlight: { value: 'blue', reqId: expect.any(Number) },
        });

        reply('confirmed');
        expect((await answer).outcome).toBe('confirmed');
        expect(robot.current.state.settled).toMatchObject({ gait: 'Backstand', headlight: 'blue' });
        expect(robot.current.state.pending).toEqual({});
    });

    it('proposes only the fields whose value differs from the displayed one', async () => {
        const { robot, reply, confirm } = connectedRobot();
        await confirm(set({ name: 'headlight', value: 'blue' }));
        // The headlight is already blue, so only the gait is proposed.
        const answer = robot.request(sequence('', enter('Running'), set({ name: 'headlight', value: 'blue' })));
        expect(robot.current.state.pending.gait).toBeDefined();
        expect(robot.current.state.pending.headlight).toBeUndefined();
        reply('confirmed');
        await answer;
    });

    it.each(['failed', 'rejected', 'unknown'] as const)('keeps the settled state on %s', async (_outcome) => {
        const { robot, reply } = connectedRobot();
        const before = robot.current.state.settled;
        const answer = robot.request(sequence('', enter('ClassicWalk'), set({ name: 'headlight', value: 'green' })));
        expect(displayed(robot.current.state)).toMatchObject({ gait: 'ClassicWalk', headlight: 'green' });

        reply(_outcome);
        await answer;
        expect(robot.current.state.settled).toEqual(before);
        expect(displayed(robot.current.state)).toEqual(before);
        expect(robot.current.state.pending).toEqual({});
    });

    it('proposes nothing for a cue that changes no tracked field, and still sends it', async () => {
        const { robot, socket, reply } = connectedRobot();
        const before = robot.current.state;
        const answer = robot.request(HELLO);
        expect(socket.written).toEqual([expect.objectContaining({ command_name: 'Hello' })]);
        expect(robot.current.state).toBe(before);
        reply('failed');
        await answer;
        expect(robot.current.state).toBe(before);
    });

    it('proposes nothing for a click on the value already displayed, and still sends it', async () => {
        const { robot, socket, reply } = connectedRobot();
        const cue = set({ name: 'headlight', value: displayed(robot.current.state).headlight });
        const before = robot.current.state;
        const answer = robot.request(cue);
        expect(socket.written).toEqual([expect.objectContaining({ command_name: cue.label, sequence: cue.steps })]);
        expect(robot.current.state).toBe(before);
        reply('confirmed');
        expect((await answer).outcome).toBe('confirmed');
        expect(robot.current.state).toBe(before);
    });

    it('proposes nothing when the channel is closed, and resolves failed', async () => {
        const { robot, socket } = connectedRobot();
        socket.readyState = CLOSED;
        const before = robot.current.state;
        const answer = robot.request(enter('Running'));
        expect(robot.current.state).toBe(before);
        expect((await answer).outcome).toBe('failed');
        expect(robot.current.state).toBe(before);
    });

    it('sets obstacle avoidance and settles it on confirmation', async () => {
        const { robot, reply } = connectedRobot();
        const answer = robot.request(set({ name: 'obstacleAvoidance', value: false }));
        expect(robot.current.state.pending.obstacleAvoidance?.value).toBe(false);
        reply('confirmed');
        await answer;
        expect(robot.current.state.settled.obstacleAvoidance).toBe(false);
    });

    it('keeps two cues on different fields pending side by side, each settled by its own verdict', async () => {
        const { robot, reply } = connectedRobot();
        const { gait } = robot.current.state.settled;
        const first = robot.request(enter('Running'));
        const second = robot.request(enter('Sitting'));
        expect(displayed(robot.current.state)).toMatchObject({ gait: 'Running', posture: 'Sitting' });

        reply('failed', 0);
        await first;
        expect(robot.current.state.settled.gait).toBe(gait);
        expect(robot.current.state.pending.gait).toBeUndefined();
        expect(robot.current.state.pending.posture).toBeDefined();

        reply('confirmed', 1);
        await second;
        expect(robot.current.state.settled).toMatchObject({ gait, posture: 'Sitting' });
    });

    it('lets a second cue on the same field replace the first, whose verdict then changes nothing', async () => {
        const { robot, reply } = connectedRobot();
        const { gait } = robot.current.state.settled;
        const first = robot.request(enter('Pose'));
        const second = robot.request(enter('Jumping'));
        expect(displayed(robot.current.state)).toMatchObject({ gait: 'Jumping', posture: null });

        const before = robot.current.state;
        reply('confirmed', 0);
        await first;
        expect(robot.current.state).toBe(before);

        reply('failed', 1);
        await second;
        expect(robot.current.state.settled.gait).toBe(gait);
    });

    it('keeps the gait on entering Pose', async () => {
        const { robot, reply, confirm } = connectedRobot();
        await confirm(enter('Backstand'));
        const answer = robot.request(enter('Pose'));
        expect(robot.current.state.pending).toEqual({ posture: { value: 'Pose', reqId: expect.any(Number) } });
        reply('confirmed');
        await answer;
        expect(robot.current.state.settled).toMatchObject({ gait: 'Backstand', posture: 'Pose' });
    });

    it('leaves the gait as it was before Sit, and no posture, after Sit then RiseSit', async () => {
        const { robot, reply, confirm } = connectedRobot();
        await confirm(enter('EconomicGait'));
        await confirm(enter('Sitting'));
        expect(robot.current.state.settled).toMatchObject({ gait: 'EconomicGait', posture: 'Sitting' });
        const answer = robot.request(leave('Sitting'));
        expect(robot.current.state.pending).toEqual({ posture: { value: null, reqId: expect.any(Number) } });
        reply('confirmed');
        await answer;
        expect(robot.current.state.settled).toMatchObject({ gait: 'EconomicGait', posture: null });
    });

});

describe('previous', () => {
    it('becomes the old gait once a cue that changes the gait is confirmed, and not before', async () => {
        const { robot, reply, confirm } = connectedRobot();
        await confirm(enter('StaticWalk'));
        const answer = robot.request(enter('Bound'));
        expect(robot.current.previous.gait).toBe('FreeWalk');
        reply('confirmed');
        await answer;
        expect(robot.current).toMatchObject({ state: { settled: { gait: 'Bound' } }, previous: { gait: 'StaticWalk' } });
    });

    it('is unchanged when the old gait is one the app cannot command', async () => {
        const { robot, socket, confirm } = connectedRobot();
        await confirm(enter('Running'));
        socket.receive(sportState(2010));
        await confirm(enter('Bound'));
        expect(robot.current).toMatchObject({ state: { settled: { gait: 'Bound' } }, previous: { gait: 'Running' } });
    });

    it('is unchanged on re-entering the current gait', async () => {
        const { robot, confirm } = connectedRobot();
        await confirm(enter('Running'));
        await confirm(enter('Running'));
        expect(robot.current.previous.gait).toBe('FreeWalk');
    });

    it('is unchanged on a refused gait change', async () => {
        const { robot, reply } = connectedRobot();
        const answer = robot.request(enter('Running'));
        reply('failed');
        await answer;
        expect(robot.current.previous.gait).toBe('FreeWalk');
    });

    it('is unchanged on entering or leaving a posture', async () => {
        const { robot, confirm } = connectedRobot();
        await confirm(enter('Running'));
        const { gait: before } = robot.current.previous;
        const cues = [enter('Pose'), leave('Pose'), enter('Damp'), enter('Sitting'), leave('Sitting'), enter('Lying')];
        for (const cue of [...cues, recover()]) {
            await confirm(cue);
            expect(robot.current.previous.gait).toBe(before);
        }
    });

    it('becomes the settled gait a confirmed sequence left, whatever gaits the sequence passed through', async () => {
        const { robot, confirm } = connectedRobot();
        await confirm(enter('StaticWalk'));
        await confirm(sequence('', enter('Running'), enter('Sitting'), enter('Backstand')));
        expect(robot.current).toMatchObject({ state: { settled: { gait: 'Backstand' } }, previous: { gait: 'StaticWalk' } });
    });
});

/** The cues `_cues` as the relay receives them. */
const asSent = (..._cues: Cue[]) =>
    _cues.map((_cue) => expect.objectContaining({ command_name: _cue.label, sequence: _cue.steps }));

/** Runs each press on a connected robot and confirms what it sent, as the relay would. Returns
 * every frame the presses wrote. */
const pressAll = ({ socket, reply }: ReturnType<typeof connectedRobot>, _presses: (() => void)[]) => {
    const from = socket.frames.length;
    _presses.forEach((_press) => {
        _press();
        reply('confirmed');
    });
    return socket.written.slice(from);
};

describe('the toggles', () => {
    it('b from FreeWalk sends Bound, then FreeWalk, then Bound again', () => {
        const connected = connectedRobot();
        const b = () => connected.robot.toggleTo('gait', 'Bound');
        expect(pressAll(connected, [b, b, b])).toEqual(asSent(enter('Bound'), enter('FreeWalk'), enter('Bound')));
        expect(connected.robot.current).toMatchObject({ state: { settled: { gait: 'Bound' } }, previous: { gait: 'FreeWalk' } });
    });

    it('b from StaticWalk, then b again, returns to StaticWalk', async () => {
        const connected = connectedRobot();
        await connected.confirm(enter('StaticWalk'));
        const b = () => connected.robot.toggleTo('gait', 'Bound');
        expect(pressAll(connected, [b, b])).toEqual(asSent(enter('Bound'), enter('StaticWalk')));
        expect(connected.robot.current).toMatchObject({ state: { settled: { gait: 'StaticWalk' } }, previous: { gait: 'Bound' } });
    });

    it('b from Bound after a gait the app cannot command returns to the gait before it, and keeps toggling', async () => {
        const connected = connectedRobot();
        connected.socket.receive(sportState(2010));
        await connected.confirm(enter('Bound'));
        const b = () => connected.robot.toggleTo('gait', 'Bound');
        expect(pressAll(connected, [b, b, b])).toEqual(asSent(enter('FreeWalk'), enter('Bound'), enter('FreeWalk')));
        expect(connected.robot.current).toMatchObject({ state: { settled: { gait: 'FreeWalk' } }, previous: { gait: 'Bound' } });
    });

    it('a from a gait sends StopMove and Pose on, then only Pose off', async () => {
        const connected = connectedRobot();
        await connected.confirm(enter('Running'));
        const a = () => connected.robot.togglePosture('Pose');
        expect(pressAll(connected, [a, a])).toEqual(asSent(enter('Pose'), leave('Pose')));
        expect(connected.robot.current).toMatchObject({
            state: { settled: { gait: 'Running', posture: null } },
            previous: { gait: 'FreeWalk' },
        });
    });

    it('a out of Pose sends only Pose off from a gait the app cannot command', () => {
        const connected = connectedRobot();
        connected.socket.receive(sportState(2010));
        connected.socket.receive(sportState(1091));
        expect(pressAll(connected, [() => connected.robot.togglePosture('Pose')])).toEqual(asSent(leave('Pose')));
    });

    it("sends the target's own entry from a posture, without leaving the posture first", async () => {
        const sitting = async () => {
            const connected = connectedRobot();
            await connected.confirm(enter('Sitting'));
            return connected;
        };
        const b = await sitting();
        expect(pressAll(b, [() => b.robot.toggleTo('gait', 'Bound')])).toEqual(asSent(enter('Bound')));
        const a = await sitting();
        expect(pressAll(a, [() => a.robot.togglePosture('Pose')])).toEqual(asSent(enter('Pose')));
    });

    it('x sits from a gait, then rises', () => {
        const connected = connectedRobot();
        const x = () => connected.robot.togglePosture('Sitting');
        expect(pressAll(connected, [x, x])).toEqual(asSent(enter('Sitting'), leave('Sitting')));
    });

    it('red from the boot green sends red, then green, then red again', () => {
        const connected = connectedRobot();
        const red = () => connected.robot.toggleTo('headlight', 'red');
        const colour = (_colour: RobotState['headlight']) => set({ name: 'headlight', value: _colour });
        expect(pressAll(connected, [red, red, red])).toEqual(asSent(colour('red'), colour('green'), colour('red')));
        expect(connected.robot.current).toMatchObject({ state: { settled: { headlight: 'red' } }, previous: { headlight: 'green' } });
    });

    it('sends nothing while a toggled field waits for a verdict, and sends once another field waits', () => {
        /** Whether `_toggle` sends a cue while `_waiting` waits for its verdict. */
        const sends = (_waiting: Cue, _toggle: (_robot: Robot) => void) => {
            const { robot, socket } = connectedRobot();
            void robot.request(_waiting);
            _toggle(robot);
            return socket.frames.length === 2;
        };
        const waitsPosture = enter('Sitting');
        const waitsGait = enter('Running');
        const waitsHeadlight = set({ name: 'headlight', value: 'red' });
        const pose = (_robot: Robot) => _robot.togglePosture('Pose');
        const sit = (_robot: Robot) => _robot.togglePosture('Sitting');
        const leap = (_robot: Robot) => _robot.toggleTo('gait', 'Bound');
        [pose, sit, leap].forEach((_toggle) => {
            expect(sends(waitsPosture, _toggle)).toBe(false);
            expect(sends(waitsHeadlight, _toggle)).toBe(true);
        });
        expect(sends(waitsGait, leap)).toBe(false);
        [pose, sit].forEach((_toggle) => expect(sends(waitsGait, _toggle)).toBe(true));
    });
});
