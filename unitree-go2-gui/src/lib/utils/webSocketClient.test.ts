import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import { WebSocketClient, encode } from './webSocketClient';
import type { Sink } from './webSocketClient';
import { robotConnected, robotReport, videoFrame, webSocketConnected } from '../stores/connection';
import { createOutcomeLog, lastOutcome, outcomeCounts, outcomeLog } from '../stores/outcomes';
import { reported, robotState } from '../stores/robotState';
import { enter, perform, sequence, set } from './commands';
import type { Cue } from './commands';
import { send } from '../stores/robotState';

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

const OK = { outcome: 'confirmed', code: 0, detail: '', label: '', at: 0 } as const;

const resultFor = (reqId: number, outcome: string, code: number | null, detail = 'because') =>
    JSON.stringify({ type: 'command_result', reqId, outcome, code, detail });

type Stores = ConstructorParameters<typeof WebSocketClient>[0];

/** Stores no other test writes, so a test that reads them depends on no earlier test. */
const freshStores = (): Stores => ({
    webSocketConnected: writable(false),
    robotConnected: writable(false),
    videoFrame: writable(null),
    robotReport: writable({}),
    outcomeLog: createOutcomeLog(),
});

/** The app's stores, for the tests that read what the app derives from them. */
const appStores: Stores = { webSocketConnected, robotConnected, videoFrame, robotReport, outcomeLog };

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

describe('request', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('sends the encoded cue, tagged with the request id it returns', async () => {
        const { client, socket } = openClient();
        const { reqId, verdict: answer } = client.request(HELLO);
        expect(socket.written[0]).toEqual({ ...encode(HELLO), reqId });
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
        expect(get(stores.robotConnected)).toBe(false);
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
        expect(get(stores.robotConnected)).toBe(false);

        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        expect(get(stores.robotConnected)).toBe(true);

        await client.received(JSON.stringify({ type: 'robot_state', connected: false }));
        expect(get(stores.robotConnected)).toBe(false);
    });

    it('drops a frame it cannot read without disturbing what it already knows', async () => {
        const { client, stores } = openClient();
        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        await client.received('{ this is not json');
        expect(get(stores.robotConnected)).toBe(true);
    });

    it('ignores JSON that is not a relay message', async () => {
        const { client, stores } = openClient();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        await client.received('null');
        await client.received(JSON.stringify({ type: 'pirouette', connected: false }));
        expect(get(stores.robotConnected)).toBe(true);
        expect(get(stores.outcomeLog)).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});

/** Settles `_cue` through a client that confirms it at once, as the relay would. */
const confirm = (_cue: Cue) =>
    send({ request: () => ({ reqId: 0, verdict: Promise.resolve({ ...OK, reqId: 0 }) }) })(_cue);

const settings = (speedLevel: unknown, obstacleAvoidance: unknown) =>
    JSON.stringify({ type: 'robot_settings', speedLevel, obstacleAvoidance });

const sportState = (errorCode: number | null, motionMode: string | null = 'mcf') =>
    JSON.stringify({ type: 'sport_state', motionMode, mode: 0, errorCode });

/** A client whose robot is up, with nothing the robot stated before counted as reported. It writes
 * the app's connection stores, which `robotState` follows, and a log of its own. */
const connectedClient = async () => {
    const opened = openClient({ ...appStores, outcomeLog: createOutcomeLog() });
    await opened.client.received(JSON.stringify({ type: 'robot_state', connected: false }));
    await opened.client.received(JSON.stringify({ type: 'robot_state', connected: true }));
    return opened;
};

describe('robot settings', () => {
    it.each([-1, 0, 1])('reports speed level %i, and only the speed', async (level) => {
        const { client } = await connectedClient();
        await client.received(settings(level, null));
        expect(get(robotReport)).toEqual({ speed: level });
        expect(get(robotState).settled.speed).toBe(level);
        expect(get(reported)).toEqual({ speed: true });
    });

    it.each([2, null])('states no speed for level %s, and warns', async (level) => {
        const { client } = await connectedClient();
        const speed = get(robotState).settled.speed;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await client.received(settings(level, true));

        expect(get(robotReport)).toEqual({ obstacleAvoidance: true });
        expect(get(robotState).settled.speed).toBe(speed);
        expect(get(reported)).toEqual({ obstacleAvoidance: true });
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it.each([null, 'yes', 1])('states no obstacle avoidance for %s', async (value) => {
        const { client } = await connectedClient();
        await client.received(settings(0, value));
        expect(get(robotReport)).toEqual({ speed: 0 });
        expect(get(reported)).toEqual({ speed: true });
    });

    it('reports obstacle avoidance', async () => {
        const { client } = await connectedClient();
        await client.received(settings(0, false));
        expect(get(robotState).settled.obstacleAvoidance).toBe(false);
        expect(get(reported)).toEqual({ speed: true, obstacleAvoidance: true });

        await client.received(settings(0, true));
        expect(get(robotState).settled.obstacleAvoidance).toBe(true);
    });

    it('leaves robotReport unchanged on a frame that states nothing', async () => {
        const { client } = await connectedClient();
        await client.received(settings(-1, null));
        const before = get(robotReport);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(settings(2, 'yes'));
        await client.received(sportState(4242));
        expect(get(robotReport)).toBe(before);
        expect(get(robotState).settled.speed).toBe(-1);
        expect(get(reported)).toEqual({ speed: true });
        warn.mockRestore();
    });

    it('does not re-apply an earlier gait report on a speed report', async () => {
        const { client } = await connectedClient();
        await client.received(sportState(2017));
        await confirm(enter('Trotting'));
        await client.received(settings(1, null));
        expect(get(robotState).settled).toMatchObject({ gait: 'Trotting', speed: 1 });
    });

    it('clears reported when the robot is lost', async () => {
        const { client } = await connectedClient();
        await client.received(settings(0, true));
        await client.received(JSON.stringify({ type: 'robot_state', connected: false }));
        expect(get(reported)).toEqual({});
    });

    it('keeps reported while the robot stays connected', async () => {
        const { client } = await connectedClient();
        await client.received(settings(0, true));
        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        expect(get(reported)).toEqual({ speed: true, obstacleAvoidance: true });
    });

    it('clears reported when the control channel closes', async () => {
        const { client } = await connectedClient();
        await client.received(settings(0, true));
        client.closed();
        expect(get(reported)).toEqual({});
    });
});

describe('sport_state report', () => {
    it('reports Leaping on code 2008 under mcf, and no posture', async () => {
        const { client } = await connectedClient();
        await client.received(sportState(2008));
        expect(get(robotReport)).toEqual({ gait: 'Leaping', posture: null });
        expect(get(robotState).settled).toMatchObject({ gait: 'Leaping', posture: null });
        expect(get(reported)).toEqual({ gait: true, posture: true });
    });

    it.each([
        [1001, 'Damp'],
        [1002, 'JointLock'],
        [1004, 'Lying'],
        [1007, 'Sitting'],
        [1091, 'Pose'],
    ])('reports code %i as the posture %s, and keeps the gait', async (_code, _posture) => {
        const { client } = await connectedClient();
        await client.received(sportState(2017));
        await client.received(sportState(_code));
        expect(get(robotReport)).toEqual({ posture: _posture });
        expect(get(robotState).settled).toMatchObject({ gait: 'Backstand', posture: _posture });
        expect(get(reported)).toEqual({ gait: true, posture: true });
    });

    it('keeps the gait and clears the posture on code 1013', async () => {
        const { client } = await connectedClient();
        await client.received(sportState(1015));
        await client.received(sportState(1007));
        await client.received(sportState(1013));
        expect(get(robotReport)).toEqual({ posture: null });
        expect(get(robotState).settled).toMatchObject({ gait: 'StaticWalk', posture: null });
    });

    it.each([
        ['the transient code 1005', 1005, 'mcf'],
        ['the transient code 1006', 1006, 'mcf'],
        ['no code', null, 'mcf'],
        ['a motion-control mode other than mcf', 2008, 'normal'],
        ['an unread motion-control mode', 2008, null],
    ])('states nothing on %s, and warns of nothing', async (_case, _code, _motionMode) => {
        const { client } = await connectedClient();
        await client.received(sportState(1016));
        await client.received(sportState(1004));
        const before = get(robotReport);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(sportState(_code, _motionMode));
        expect(get(robotReport)).toBe(before);
        expect(get(robotState).settled).toMatchObject({ gait: 'Trotting', posture: 'Lying' });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('changes nothing on an unknown code, and warns once per code', async () => {
        const { client } = await connectedClient();
        await client.received(sportState(1016));
        const before = get(robotReport);
        const { settled } = get(robotState);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(sportState(9001));
        await client.received(sportState(9001));
        expect(get(robotReport)).toBe(before);
        expect(get(robotState).settled).toEqual(settled);
        expect(warn).toHaveBeenCalledOnce();

        await client.received(sportState(9002));
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('applies each of two reports stating the same gait', async () => {
        const { client } = await connectedClient();
        await client.received(sportState(2017));
        expect(get(robotState).settled.gait).toBe('Backstand');

        await confirm(enter('Trotting'));
        expect(get(robotState).settled.gait).toBe('Trotting');

        await client.received(sportState(2017));
        expect(get(robotState).settled.gait).toBe('Backstand');
    });

    it('does not re-apply an earlier speed report on a gait report', async () => {
        const { client } = await connectedClient();
        await client.received(settings(-1, null));
        await confirm(set({ name: 'speed', value: 1 }));
        await client.received(sportState(2008));
        expect(get(robotState).settled).toMatchObject({ gait: 'Leaping', speed: 1 });
    });

    it('leaves a pending gait proposal pending', async () => {
        const { client, socket } = await connectedClient();
        const done = send(client)(enter('Jumping'));
        await client.received(sportState(2011));
        expect(get(robotState).settled.gait).toBe('Handstand');
        expect(get(robotState).pending.gait).toEqual({ value: 'Jumping', reqId: reqIdOf(socket) });

        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        await done;
        expect(get(robotState).settled.gait).toBe('Jumping');
    });
});
