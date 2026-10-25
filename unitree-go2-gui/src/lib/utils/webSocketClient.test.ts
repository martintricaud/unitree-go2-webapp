import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { WebSocketClient } from './webSocketClient';
import type { Sink } from './webSocketClient';
import { createMirror, mirror } from '../stores/mirror';
import { lastOutcome, outcomeCounts, outcomeLog, recorded } from '../stores/outcomes';
import type { Outcome } from '../stores/outcomes';
import { enter, leave, perform, sequence, set, wait } from './commands';
import type { Cue } from './commands';
import { displayed } from './confirmable';

// The relay bounds every command at 5s.
const RELAY_WORST_CASE_MS = 5_000;
const BACKSTOP_MS = 20_000;

const OPEN = 1;
const CLOSED = 3;

/** A socket that records what the client writes, so no relay and no network are involved. */
class FakeSocket implements Sink {
    readyState = OPEN;
    frames: string[] = [];
    throwOnSend = false;

    send(data: string) {
        if (this.throwOnSend) throw new Error('socket is gone');
        this.frames.push(data);
    }

    /** What the client wrote, parsed. */
    get written(): Record<string, unknown>[] {
        return this.frames.map((frame) => JSON.parse(frame));
    }
}

const HELLO = perform('Hello');

const DANCE = sequence('Dance', HELLO);

const resultFor = (reqId: number, outcome: string, code: number | null, detail = 'because') =>
    JSON.stringify({ type: 'command_result', reqId, outcome, code, detail });

type Stores = ConstructorParameters<typeof WebSocketClient>[0];

/** Stores no other test writes, so a test that reads them depends on no earlier test. */
const freshStores = (): Stores => ({ mirror: createMirror(), outcomeLog: writable<Outcome[]>([]) });

/** The app's stores, for the tests that read what the app derives from them. */
const appStores: Stores = { mirror, outcomeLog };

/** A client attached to a fresh open socket, with the outcome log cleared as on connect. */
const openClient = (_stores: Stores = freshStores()) => {
    const socket = new FakeSocket();
    const client = new WebSocketClient(_stores);
    client.attach(socket);
    client.opened();
    return { client, socket, stores: _stores };
};

const reqIdOf = (socket: FakeSocket, index = 0): number => {
    const reqId = socket.written[index].reqId;
    if (typeof reqId !== 'number') throw new Error(`frame ${index} carries no numeric reqId`);
    return reqId;
};

describe('send', () => {
    it('writes the message and answers true when the socket is open', () => {
        const { client, socket } = openClient();
        expect(client.send({ command_name: 'connect', ip: '192.168.123.161' })).toBe(true);
        expect(socket.written).toEqual([{ command_name: 'connect', ip: '192.168.123.161' }]);
    });

    it('answers false rather than throwing when the socket is closed', () => {
        const { client, socket } = openClient();
        socket.readyState = CLOSED;
        expect(() => client.send(HELLO)).not.toThrow();
        expect(client.send(HELLO)).toBe(false);
        expect(socket.frames).toEqual([]);
    });

    it('answers false rather than throwing when no socket has been attached', () => {
        const client = new WebSocketClient(freshStores());
        expect(client.send(HELLO)).toBe(false);
    });

    it('answers false rather than throwing when the socket itself throws', () => {
        const { client, socket } = openClient();
        socket.throwOnSend = true;
        expect(client.send(HELLO)).toBe(false);
    });
});

describe.each([
    ['setLidar', 'lidar', 'lidarOn'],
    ['setMonitoring', 'subscribe', 'monitoringOn'],
] as const)('%s', (_method, _commandName, _flag) => {
    it('sends the switch and records it once the message has left the browser', () => {
        const { client, socket, stores } = openClient();
        client[_method](true);
        expect(socket.written).toEqual([{ command_name: _commandName, switch: true }]);
        expect(get(stores.mirror)[_flag]).toBe(true);
        client[_method](false);
        expect(socket.written[1]).toEqual({ command_name: _commandName, switch: false });
        expect(get(stores.mirror)[_flag]).toBe(false);
    });

    it('keeps the flag when the channel is closed', () => {
        const { client, socket, stores } = openClient();
        socket.readyState = CLOSED;
        client[_method](true);
        expect(socket.frames).toEqual([]);
        expect(get(stores.mirror)[_flag]).toBe(false);
    });
});

describe('request', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it("sends the cue as one sequence of its steps, named by its label and tagged with the request id it returns", async () => {
        const { client, socket } = openClient();
        const { reqId, verdict: answer } = client.request(HELLO);
        expect(socket.written[0]).toEqual({ kind: 'sequence', command_name: 'Hello', sequence: HELLO.steps, reqId });
        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        await answer;
    });

    it('gives each command its own request id', async () => {
        const { client, socket } = openClient();
        const first = client.request(HELLO).verdict;
        const second = client.request(HELLO).verdict;
        expect(reqIdOf(socket, 0)).not.toBe(reqIdOf(socket, 1));

        await client.received(resultFor(reqIdOf(socket, 0), 'confirmed', 0));
        await client.received(resultFor(reqIdOf(socket, 1), 'failed', 3203));
        expect((await first).outcome).toBe('confirmed');
        expect((await second).outcome).toBe('failed');
    });

    it('resolves confirmed for a result carrying code 0', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO).verdict;
        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        expect(await answer).toMatchObject({
            outcome: 'confirmed',
            code: 0,
            detail: 'because',
            reqId: reqIdOf(socket),
            label: 'Hello',
        });
    });

    it('resolves failed for a result carrying a non-zero code', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO).verdict;
        await client.received(resultFor(reqIdOf(socket), 'failed', 3203));
        expect(await answer).toMatchObject({ outcome: 'failed', code: 3203, detail: 'because' });
    });

    it('reads a result that carries no detail as an empty detail', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO).verdict;
        await client.received(
            JSON.stringify({ type: 'command_result', reqId: reqIdOf(socket), outcome: 'confirmed', code: 0, detail: null }),
        );
        expect((await answer).detail).toBe('');
    });

    it('resolves rejected when the bridge turned the request away', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO).verdict;
        await client.received(resultFor(reqIdOf(socket), 'rejected', null));
        expect((await answer).outcome).toBe('rejected');
    });

    it('reads a result whose outcome it does not recognise as unknown', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO).verdict;
        await client.received(resultFor(reqIdOf(socket), 'pirouette', 0));
        expect((await answer).outcome).toBe('unknown');
    });

    it('matches each verdict to its own request when they arrive out of order', async () => {
        const { client, socket } = openClient();
        const first = client.request(HELLO).verdict;
        const second = client.request(DANCE).verdict;

        await client.received(resultFor(reqIdOf(socket, 1), 'failed', 3203));
        await client.received(resultFor(reqIdOf(socket, 0), 'confirmed', 0));

        expect((await first).outcome).toBe('confirmed');
        expect((await second).outcome).toBe('failed');
    });

    it('resolves failed at once when the socket is closed, without waiting out the backstop', async () => {
        const { client, socket } = openClient();
        socket.readyState = CLOSED;
        const answer = await client.request(HELLO).verdict;
        expect(answer).toMatchObject({ outcome: 'failed', label: 'Hello' });
        expect(socket.frames).toEqual([]);
    });

    it('resolves unknown when no result arrives before the client-side timeout', async () => {
        vi.useFakeTimers();
        const { client } = openClient();
        const answer = client.request(HELLO).verdict;
        await vi.advanceTimersByTimeAsync(BACKSTOP_MS + 1);
        expect(await answer).toMatchObject({ outcome: 'unknown', label: 'Hello' });
    });

    it('holds past the longest wait the relay itself can be in, so a slow command is not called unknown', async () => {
        vi.useFakeTimers();
        const { client, socket } = openClient();
        let settled = false;
        const answer = client.request(HELLO).verdict.then((outcome) => {
            settled = true;
            return outcome;
        });

        await vi.advanceTimersByTimeAsync(RELAY_WORST_CASE_MS);
        expect(settled).toBe(false);

        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        expect((await answer).outcome).toBe('confirmed');
    });

    it('settles every waiting request when the control channel closes', async () => {
        const { client, socket, stores } = openClient();
        const answer = client.request(HELLO).verdict;
        const reqId = reqIdOf(socket);
        client.closed();
        expect(await answer).toMatchObject({ outcome: 'failed', reqId, label: 'Hello' });
        expect(get(stores.mirror).robotConnected).toBe(false);
    });

    it('ignores a verdict that arrives after its request already settled', async () => {
        const { client, socket, stores } = openClient();
        const answer = client.request(HELLO).verdict;
        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        expect((await answer).outcome).toBe('confirmed');

        await client.received(resultFor(reqIdOf(socket), 'failed', 3203));
        expect(get(stores.outcomeLog).map((entry) => entry.outcome)).toEqual(['failed', 'confirmed']);
    });
});

describe('the outcome log', () => {
    // `lastOutcome` and `outcomeCounts` derive from the app's log, so these clients write to it.
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

    it('labels an entry with the command the browser sent', async () => {
        const { client, socket } = openClient(appStores);
        client.request(DANCE);
        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        expect(get(lastOutcome)).toMatchObject({ label: 'Dance', outcome: 'confirmed', code: 0 });
    });

    it('drops a result that carries no request id, since this browser always sends one', async () => {
        const { client } = openClient(appStores);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(
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

    it('counts every outcome, and reports zero for the names nothing landed on', async () => {
        const { client, socket } = openClient(appStores);
        client.request(HELLO);
        client.request(HELLO);
        client.request(HELLO);
        await client.received(resultFor(reqIdOf(socket, 0), 'confirmed', 0));
        await client.received(resultFor(reqIdOf(socket, 1), 'failed', 3203));
        await client.received(resultFor(reqIdOf(socket, 2), 'rejected', null));

        expect(get(outcomeCounts)).toEqual({
            confirmed: 1,
            failed: 1,
            rejected: 1,
            unknown: 0,
        });
    });

    it('starts again when the control channel opens', async () => {
        const { client, socket } = openClient(appStores);
        client.request(HELLO);
        await client.received(resultFor(reqIdOf(socket), 'failed', 3203));
        expect(get(outcomeLog)).toHaveLength(1);

        client.opened();
        expect(get(outcomeLog)).toEqual([]);
        expect(get(outcomeCounts)).toEqual({ confirmed: 0, failed: 0, rejected: 0, unknown: 0 });
        expect(get(lastOutcome)).toBeNull();
    });
});

describe('robot state', () => {
    it('follows every robot_state the relay sends, not only the first', async () => {
        const { client, stores } = openClient();
        await client.received(JSON.stringify({ type: 'robot_state', connected: false }));
        expect(get(stores.mirror).robotConnected).toBe(false);

        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        expect(get(stores.mirror).robotConnected).toBe(true);

        await client.received(JSON.stringify({ type: 'robot_state', connected: false }));
        expect(get(stores.mirror).robotConnected).toBe(false);
    });

    it('drops a frame it cannot read without disturbing what it already knows', async () => {
        const { client, stores } = openClient();
        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        await client.received('{ this is not json');
        expect(get(stores.mirror).robotConnected).toBe(true);
    });

    it('ignores JSON that is not a relay message', async () => {
        const { client, stores } = openClient();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        await client.received('null');
        await client.received(JSON.stringify({ type: 'pirouette', connected: false }));
        expect(get(stores.mirror).robotConnected).toBe(true);
        expect(get(stores.outcomeLog)).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});

const settings = (speedLevel: unknown, obstacleAvoidance: unknown) =>
    JSON.stringify({ type: 'robot_settings', speedLevel, obstacleAvoidance });

const sportState = (errorCode: number | null, motionMode: string | null = 'mcf') =>
    JSON.stringify({ type: 'sport_state', motionMode, mode: 0, errorCode });

/** A client whose robot is up, on fresh stores. Nothing the robot stated before counts as reported. */
const connectedClient = async () => {
    const opened = openClient();
    const { client, socket, stores } = opened;
    await client.received(JSON.stringify({ type: 'robot_state', connected: false }));
    await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
    /** Answers request `_index`, by default the latest, with `_outcome`, as the relay would. */
    const reply = (_outcome: Outcome['outcome'], _index = socket.frames.length - 1) =>
        client.received(resultFor(reqIdOf(socket, _index), _outcome, null));
    /** Settles `_cue` by answering its request with a confirmation. */
    const confirm = async (_cue: Cue) => {
        const { verdict } = client.request(_cue);
        await reply('confirmed');
        return verdict;
    };
    return { ...opened, mirror: stores.mirror, reply, confirm };
};

describe('robot settings', () => {
    it.each([-1, 0, 1])('reports speed level %i, and only the speed', async (level) => {
        const { client, mirror } = await connectedClient();
        await client.received(settings(level, null));
        expect(get(mirror).robot.settled.speed).toBe(level);
        expect(get(mirror).reported).toEqual({ speed: true });
    });

    it.each([2, null])('states no speed for level %s, and warns', async (level) => {
        const { client, mirror } = await connectedClient();
        const speed = get(mirror).robot.settled.speed;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await client.received(settings(level, true));

        expect(get(mirror).robot.settled.speed).toBe(speed);
        expect(get(mirror).reported).toEqual({ obstacleAvoidance: true });
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it.each([null, 'yes', 1])('states no obstacle avoidance for %s', async (value) => {
        const { client, mirror } = await connectedClient();
        await client.received(settings(0, value));
        expect(get(mirror).reported).toEqual({ speed: true });
    });

    it('reports obstacle avoidance', async () => {
        const { client, mirror } = await connectedClient();
        await client.received(settings(0, false));
        expect(get(mirror).robot.settled.obstacleAvoidance).toBe(false);
        expect(get(mirror).reported).toEqual({ speed: true, obstacleAvoidance: true });

        await client.received(settings(0, true));
        expect(get(mirror).robot.settled.obstacleAvoidance).toBe(true);
    });

    it('leaves the mirror unchanged on a frame that states nothing', async () => {
        const { client, mirror } = await connectedClient();
        await client.received(settings(-1, null));
        const before = get(mirror);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(settings(2, 'yes'));
        await client.received(sportState(4242));
        expect(get(mirror)).toBe(before);
        expect(get(mirror).robot.settled.speed).toBe(-1);
        expect(get(mirror).reported).toEqual({ speed: true });
        warn.mockRestore();
    });

    it('does not re-apply an earlier gait report on a speed report', async () => {
        const { client, mirror, confirm } = await connectedClient();
        await client.received(sportState(2017));
        await confirm(enter('Trotting'));
        await client.received(settings(1, null));
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'Trotting', speed: 1 });
    });

    it('clears reported when the robot is lost', async () => {
        const { client, mirror } = await connectedClient();
        await client.received(settings(0, true));
        await client.received(JSON.stringify({ type: 'robot_state', connected: false }));
        expect(get(mirror).reported).toEqual({});
    });

    it('keeps reported while the robot stays connected', async () => {
        const { client, mirror } = await connectedClient();
        await client.received(settings(0, true));
        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        expect(get(mirror).reported).toEqual({ speed: true, obstacleAvoidance: true });
    });

    it('clears reported when the control channel closes', async () => {
        const { client, mirror } = await connectedClient();
        await client.received(settings(0, true));
        client.closed();
        expect(get(mirror).reported).toEqual({});
    });
});

describe('sport_state report', () => {
    it('reports Leaping on code 2008 under mcf, and no posture', async () => {
        const { client, mirror } = await connectedClient();
        await client.received(sportState(2008));
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'Leaping', posture: null });
        expect(get(mirror).reported).toEqual({ gait: true, posture: true });
    });

    it.each([
        [1001, 'Damp'],
        [1002, 'JointLock'],
        [1004, 'Lying'],
        [1007, 'Sitting'],
        [1091, 'Pose'],
    ])('reports code %i as the posture %s, and keeps the gait', async (_code, _posture) => {
        const { client, mirror } = await connectedClient();
        await client.received(sportState(2017));
        await client.received(sportState(_code));
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'Backstand', posture: _posture });
        expect(get(mirror).reported).toEqual({ gait: true, posture: true });
    });

    it('keeps the gait and clears the posture on code 1013', async () => {
        const { client, mirror } = await connectedClient();
        await client.received(sportState(1015));
        await client.received(sportState(1007));
        await client.received(sportState(1013));
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'StaticWalk', posture: null });
    });

    it.each([
        ['the transient code 1005', 1005, 'mcf'],
        ['the transient code 1006', 1006, 'mcf'],
        ['no code', null, 'mcf'],
        ['a motion-control mode other than mcf', 2008, 'normal'],
        ['an unread motion-control mode', 2008, null],
    ])('states nothing on %s, and warns of nothing', async (_case, _code, _motionMode) => {
        const { client, mirror } = await connectedClient();
        await client.received(sportState(1016));
        await client.received(sportState(1004));
        const before = get(mirror);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(sportState(_code, _motionMode));
        expect(get(mirror)).toBe(before);
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'Trotting', posture: 'Lying' });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('changes nothing on an unknown code, and warns once per code', async () => {
        const { client, mirror } = await connectedClient();
        await client.received(sportState(1016));
        const before = get(mirror);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(sportState(9001));
        await client.received(sportState(9001));
        expect(get(mirror)).toBe(before);
        expect(warn).toHaveBeenCalledOnce();

        await client.received(sportState(9002));
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('applies each of two reports stating the same gait', async () => {
        const { client, mirror, confirm } = await connectedClient();
        await client.received(sportState(2017));
        expect(get(mirror).robot.settled.gait).toBe('Backstand');

        await confirm(enter('Trotting'));
        expect(get(mirror).robot.settled.gait).toBe('Trotting');

        await client.received(sportState(2017));
        expect(get(mirror).robot.settled.gait).toBe('Backstand');
    });

    it('does not re-apply an earlier speed report on a gait report', async () => {
        const { client, mirror, confirm } = await connectedClient();
        await client.received(settings(-1, null));
        await confirm(set({ name: 'speed', value: 1 }));
        await client.received(sportState(2008));
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'Leaping', speed: 1 });
    });

    it('leaves a pending gait proposal pending', async () => {
        const { client, socket, mirror } = await connectedClient();
        const done = client.request(enter('Jumping')).verdict;
        await client.received(sportState(2011));
        expect(get(mirror).robot.settled.gait).toBe('Handstand');
        expect(get(mirror).robot.pending.gait).toEqual({ value: 'Jumping', reqId: reqIdOf(socket) });

        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        await done;
        expect(get(mirror).robot.settled.gait).toBe('Jumping');
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

describe('request and the mirror', () => {
    it('proposes under the request id the client sent to the relay', async () => {
        const { client, socket, mirror, reply } = await connectedClient();
        const { verdict } = client.request(set({ name: 'headlight', value: 'red' }));
        expect(get(mirror).robot.pending.headlight?.reqId).toBe(reqIdOf(socket));

        await reply('confirmed');
        await verdict;
        expect(get(mirror).robot.pending).toEqual({});
    });

    it('proposes each field a cue changes, and a confirmation settles them', async () => {
        const { client, socket, mirror, reply } = await connectedClient();
        const { verdict } = client.request(SABOTS);

        expect(socket.written).toEqual([expect.objectContaining({ command_name: 'Sabots', sequence: SABOTS.steps })]);
        // previousGait goes from FreeWalk to FreeWalk, so it is not proposed.
        expect(get(mirror).robot.pending).toEqual({
            gait: { value: 'Backstand', reqId: expect.any(Number) },
            headlight: { value: 'blue', reqId: expect.any(Number) },
        });

        await reply('confirmed');
        expect((await verdict).outcome).toBe('confirmed');
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'Backstand', headlight: 'blue' });
        expect(get(mirror).robot.pending).toEqual({});
    });

    it('proposes only the fields whose value differs from the displayed one', async () => {
        const { client, mirror, reply, confirm } = await connectedClient();
        await confirm(set({ name: 'headlight', value: 'blue' }));
        // The headlight is already blue, so only the gait is proposed.
        const { verdict } = client.request(sequence('', enter('Trotting'), set({ name: 'headlight', value: 'blue' })));
        expect(get(mirror).robot.pending.gait).toBeDefined();
        expect(get(mirror).robot.pending.headlight).toBeUndefined();
        await reply('confirmed');
        await verdict;
    });

    it.each(['failed', 'rejected', 'unknown'] as const)('keeps the settled state on %s', async (_outcome) => {
        const { client, mirror, reply } = await connectedClient();
        const before = get(mirror).robot.settled;
        const { verdict } = client.request(
            sequence('', enter('ClassicWalk'), set({ name: 'headlight', value: 'green' })),
        );
        expect(displayed(get(mirror).robot)).toMatchObject({ gait: 'ClassicWalk', headlight: 'green' });

        await reply(_outcome);
        await verdict;
        expect(get(mirror).robot.settled).toEqual(before);
        expect(displayed(get(mirror).robot)).toEqual(before);
        expect(get(mirror).robot.pending).toEqual({});
    });

    it('proposes nothing for a cue that changes no tracked field, and still sends it', async () => {
        const { client, socket, mirror, reply } = await connectedClient();
        const before = get(mirror).robot;
        const { verdict } = client.request(HELLO);
        expect(socket.written).toEqual([expect.objectContaining({ command_name: 'Hello' })]);
        expect(get(mirror).robot).toBe(before);
        await reply('failed');
        await verdict;
        expect(get(mirror).robot).toBe(before);
    });

    it('proposes nothing for a click on the value already displayed, and still sends it', async () => {
        const { client, socket, mirror, reply } = await connectedClient();
        const cue = set({ name: 'headlight', value: displayed(get(mirror).robot).headlight });
        const before = get(mirror).robot;
        const { verdict } = client.request(cue);
        expect(socket.written).toEqual([expect.objectContaining({ command_name: cue.label, sequence: cue.steps })]);
        expect(get(mirror).robot).toBe(before);
        await reply('confirmed');
        expect((await verdict).outcome).toBe('confirmed');
        expect(get(mirror).robot).toBe(before);
    });

    it('proposes nothing when the channel is closed, and resolves failed', async () => {
        const { client, socket, mirror } = await connectedClient();
        socket.readyState = CLOSED;
        const before = get(mirror).robot;
        const { verdict } = client.request(enter('Trotting'));
        expect(get(mirror).robot).toBe(before);
        expect((await verdict).outcome).toBe('failed');
        expect(get(mirror).robot).toBe(before);
    });

    it('sets obstacle avoidance and settles it on confirmation', async () => {
        const { client, mirror, reply } = await connectedClient();
        const { verdict } = client.request(set({ name: 'obstacleAvoidance', value: false }));
        expect(get(mirror).robot.pending.obstacleAvoidance?.value).toBe(false);
        await reply('confirmed');
        await verdict;
        expect(get(mirror).robot.settled.obstacleAvoidance).toBe(false);
    });

    it('keeps two cues on different fields pending side by side, each settled by its own verdict', async () => {
        const { client, mirror, reply } = await connectedClient();
        const { gait } = get(mirror).robot.settled;
        const first = client.request(enter('Trotting')).verdict;
        const second = client.request(enter('Sitting')).verdict;
        expect(displayed(get(mirror).robot)).toMatchObject({ gait: 'Trotting', posture: 'Sitting' });

        await reply('failed', 0);
        await first;
        expect(get(mirror).robot.settled.gait).toBe(gait);
        expect(get(mirror).robot.pending.gait).toBeUndefined();
        expect(get(mirror).robot.pending.posture).toBeDefined();

        await reply('confirmed', 1);
        await second;
        expect(get(mirror).robot.settled).toMatchObject({ gait, posture: 'Sitting' });
    });

    it('lets a second cue on the same field replace the first, whose verdict then changes nothing', async () => {
        const { client, mirror, reply } = await connectedClient();
        const { gait } = get(mirror).robot.settled;
        const first = client.request(enter('Pose')).verdict;
        const second = client.request(enter('Jumping')).verdict;
        expect(displayed(get(mirror).robot)).toMatchObject({ gait: 'Jumping', posture: null });

        const before = get(mirror).robot;
        await reply('confirmed', 0);
        await first;
        expect(get(mirror).robot).toBe(before);

        await reply('failed', 1);
        await second;
        expect(get(mirror).robot.settled.gait).toBe(gait);
    });

    it('keeps the gait on entering Pose', async () => {
        const { client, mirror, reply, confirm } = await connectedClient();
        await confirm(enter('Backstand'));
        const { verdict } = client.request(enter('Pose'));
        expect(get(mirror).robot.pending).toEqual({ posture: { value: 'Pose', reqId: expect.any(Number) } });
        await reply('confirmed');
        await verdict;
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'Backstand', posture: 'Pose' });
    });

    it('leaves the gait as it was before Sit, and no posture, after Sit then RiseSit', async () => {
        const { client, mirror, reply, confirm } = await connectedClient();
        await confirm(enter('EconomicGait'));
        await confirm(enter('Sitting'));
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'EconomicGait', posture: 'Sitting' });
        const { verdict } = client.request(leave('Sitting'));
        expect(get(mirror).robot.pending).toEqual({ posture: { value: null, reqId: expect.any(Number) } });
        await reply('confirmed');
        await verdict;
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'EconomicGait', posture: null });
    });

    it('proposes the old gait as previousGait when a cue changes the gait', async () => {
        const { client, mirror, reply, confirm } = await connectedClient();
        await confirm(enter('StaticWalk'));
        const { verdict } = client.request(enter('Leaping'));
        expect(get(mirror).robot.pending).toEqual({
            gait: { value: 'Leaping', reqId: expect.any(Number) },
            previousGait: { value: 'StaticWalk', reqId: expect.any(Number) },
        });
        await reply('confirmed');
        await verdict;
        expect(get(mirror).robot.settled).toMatchObject({ gait: 'Leaping', previousGait: 'StaticWalk' });
    });

    it('keeps previousGait on entering and leaving a posture', async () => {
        const { client, mirror, reply } = await connectedClient();
        const { previousGait } = get(mirror).robot.settled;
        for (const cue of [enter('Pose'), leave('Pose'), enter('Sitting'), leave('Sitting')]) {
            const { verdict } = client.request(cue);
            expect(get(mirror).robot.pending.previousGait).toBeUndefined();
            await reply('confirmed');
            await verdict;
            expect(get(mirror).robot.settled.previousGait).toBe(previousGait);
        }
    });
});
