import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { WebSocketClient } from './webSocketClient';
import type { Sink } from './webSocketClient';
import { robotConnected } from '../stores/connection';
import { lastOutcome, outcomeCounts, outcomeLog } from '../stores/outcomes';
import { perform, sequence } from './commands';
import { encode } from './encode';

// The relay bounds one command at max(5s, exec_time + 3s), and the longest exec_time in
// commands_1.1.7.json is 10s, so 13s is the longest wait the relay itself can be in.
const RELAY_WORST_CASE_MS = 13_000;
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

/** A client attached to a fresh open socket, with the outcome log cleared as on connect. */
const openClient = () => {
    const socket = new FakeSocket();
    const client = new WebSocketClient();
    client.attach(socket);
    client.opened();
    return { client, socket };
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
        const client = new WebSocketClient();
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

    it('sends the encoded cue, tagged with a numeric request id', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO);
        expect(socket.written[0]).toEqual({ ...encode(HELLO), reqId: reqIdOf(socket) });
        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        await answer;
    });

    it('gives each command its own request id', async () => {
        const { client, socket } = openClient();
        const first = client.request(HELLO);
        const second = client.request(HELLO);
        expect(reqIdOf(socket, 0)).not.toBe(reqIdOf(socket, 1));

        await client.received(resultFor(reqIdOf(socket, 0), 'confirmed', 0));
        await client.received(resultFor(reqIdOf(socket, 1), 'failed', 3203));
        expect((await first).outcome).toBe('confirmed');
        expect((await second).outcome).toBe('failed');
    });

    it('resolves confirmed for a result carrying code 0', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO);
        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        expect(await answer).toEqual({ outcome: 'confirmed', code: 0, detail: 'because' });
    });

    it('resolves failed for a result carrying a non-zero code', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO);
        await client.received(resultFor(reqIdOf(socket), 'failed', 3203));
        expect(await answer).toEqual({ outcome: 'failed', code: 3203, detail: 'because' });
    });

    it('resolves rejected when the bridge turned the request away', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO);
        await client.received(resultFor(reqIdOf(socket), 'rejected', null));
        expect((await answer).outcome).toBe('rejected');
    });

    it('reads a result whose outcome it does not recognise as unknown', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO);
        await client.received(resultFor(reqIdOf(socket), 'pirouette', 0));
        expect((await answer).outcome).toBe('unknown');
    });

    it('matches each verdict to its own request when they arrive out of order', async () => {
        const { client, socket } = openClient();
        const first = client.request(HELLO);
        const second = client.request(DANCE);

        await client.received(resultFor(reqIdOf(socket, 1), 'failed', 3203));
        await client.received(resultFor(reqIdOf(socket, 0), 'confirmed', 0));

        expect((await first).outcome).toBe('confirmed');
        expect((await second).outcome).toBe('failed');
    });

    it('resolves failed at once when the socket is closed, without waiting out the backstop', async () => {
        const { client, socket } = openClient();
        socket.readyState = CLOSED;
        const answer = await client.request(HELLO);
        expect(answer.outcome).toBe('failed');
        expect(socket.frames).toEqual([]);
    });

    it('resolves unknown when no result arrives before the client-side timeout', async () => {
        vi.useFakeTimers();
        const { client } = openClient();
        const answer = client.request(HELLO);
        await vi.advanceTimersByTimeAsync(BACKSTOP_MS + 1);
        expect((await answer).outcome).toBe('unknown');
    });

    it('holds past the longest wait the relay itself can be in, so a slow command is not called unknown', async () => {
        vi.useFakeTimers();
        const { client, socket } = openClient();
        let settled = false;
        const answer = client.request(HELLO).then((outcome) => {
            settled = true;
            return outcome;
        });

        await vi.advanceTimersByTimeAsync(RELAY_WORST_CASE_MS);
        expect(settled).toBe(false);

        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        expect((await answer).outcome).toBe('confirmed');
    });

    it('settles every waiting request when the control channel closes', async () => {
        const { client } = openClient();
        const answer = client.request(HELLO);
        client.closed();
        expect((await answer).outcome).toBe('failed');
        expect(get(robotConnected)).toBe(false);
    });

    it('ignores a verdict that arrives after its request already settled', async () => {
        const { client, socket } = openClient();
        const answer = client.request(HELLO);
        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        expect((await answer).outcome).toBe('confirmed');

        await client.received(resultFor(reqIdOf(socket), 'failed', 3203));
        expect(get(outcomeLog).map((entry) => entry.outcome)).toEqual(['failed', 'confirmed']);
    });
});

describe('the outcome log', () => {
    beforeEach(() => {
        vi.useRealTimers();
    });

    it('labels an entry with the command the browser sent', async () => {
        const { client, socket } = openClient();
        client.request(DANCE);
        await client.received(resultFor(reqIdOf(socket), 'confirmed', 0));
        expect(get(lastOutcome)).toMatchObject({ label: 'Dance', outcome: 'confirmed', code: 0 });
    });

    it("labels a result the browser did not ask for with the relay's command name", async () => {
        const { client } = openClient();
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
        expect(get(lastOutcome)).toMatchObject({ label: 'StandUp', reqId: null });
    });

    it('counts every outcome, and reports zero for the names nothing landed on', async () => {
        const { client, socket } = openClient();
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
        const { client, socket } = openClient();
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
        const { client } = openClient();
        await client.received(JSON.stringify({ type: 'robot_state', connected: false }));
        expect(get(robotConnected)).toBe(false);

        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        expect(get(robotConnected)).toBe(true);

        await client.received(JSON.stringify({ type: 'robot_state', connected: false }));
        expect(get(robotConnected)).toBe(false);
    });

    it('drops a frame it cannot read without disturbing what it already knows', async () => {
        const { client } = openClient();
        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        await client.received('{ this is not json');
        expect(get(robotConnected)).toBe(true);
    });

    it('ignores JSON that is not a relay message', async () => {
        const { client } = openClient();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await client.received(JSON.stringify({ type: 'robot_state', connected: true }));
        await client.received('null');
        await client.received(JSON.stringify({ type: 'pirouette', connected: false }));
        expect(get(robotConnected)).toBe(true);
        expect(get(outcomeLog)).toEqual([]);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});
