import { writable } from 'svelte/store';
import type { CueItem } from './commandUtilities';
import { clearOutcomes, readOutcome, recordOutcome } from './outcomes';
import type { Outcome } from './outcomes';

const RELAY_URL = 'ws://localhost:8000/ws';

// The two WebSocket.readyState values this client tests against, named here so the module and
// its tests do not depend on the browser global being present.
const OPEN = 1;
const CLOSED = 3;

/// How long the browser waits for a verdict before answering the caller itself. The relay
/// bounds each command at max(5s, exec_time + 3s) and the longest exec_time in
/// commands_1.1.7.json is 10s, so the relay can still be legitimately waiting 13s after a
/// command was sent. This backstop sits above that bound: it fires only when the relay has
/// stopped answering, never on a command the relay is still bounded on.
const REPLY_BACKSTOP_MS = 20_000;

/// A command that never left the browser did not run, which is a failure and not a silence:
/// nothing about it is uncertain.
const CHANNEL_CLOSED: Outcome = {
    outcome: 'failed',
    code: null,
    detail: 'the control channel is closed, so the command never left the browser',
};

const RELAY_SILENT: Outcome = {
    outcome: 'unknown',
    code: null,
    detail: `the relay sent no verdict within ${REPLY_BACKSTOP_MS / 1000}s`,
};

// Using stores lets us easily bind to these values in Svelte components
export const webSocketConnected = writable(false);
export const robotConnected = writable(false);
export const videoFrame = writable<ImageBitmap | null>(null);

/// The part of a WebSocket this client writes to. The browser's WebSocket satisfies it, and a
/// test supplies a recorder, so transport behaviour is exercised with no relay running.
export type Sink = { readyState: number; send(data: string): void };

type Pending = {
    resolve: (outcome: Outcome) => void;
    timer: ReturnType<typeof setTimeout>;
    label: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const parseJson = (raw: string): unknown => {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const labelOf = (item: CueItem): string => {
    switch (item.kind) {
        case 'command':
            return item.command_name;
        case 'wait':
            return `wait ${item.wait}s`;
        case 'sequence':
            return item.displayName ?? 'sequence';
    }
};

export class WebSocketClient {
    private socket: Sink | null = null;
    private previousBitmap: ImageBitmap | null = null;
    private pending = new Map<number, Pending>();
    private lastRequestId = 0;
    public onTrackCallback: (stream: MediaStream) => void = () => {};

    connect() {
        if (this.socket && this.socket.readyState < CLOSED) return;
        const ws = new WebSocket(RELAY_URL);
        ws.onopen = () => this.opened();
        ws.onclose = () => this.closed();
        ws.onmessage = (event) => {
            void this.received(event.data);
        };
        this.attach(ws);
    }

    /// Wire this client to a transport. `connect` passes a browser WebSocket; a test passes a
    /// recorder and drives `opened`, `received` and `closed` itself.
    attach(socket: Sink) {
        this.socket = socket;
    }

    opened() {
        webSocketConnected.set(true);
        clearOutcomes();
    }

    closed() {
        webSocketConnected.set(false);
        robotConnected.set(false);
        this.previousBitmap?.close();
        this.previousBitmap = null;
        // Nothing can answer these now, so settle them rather than leave each caller waiting
        // out the backstop.
        for (const reqId of [...this.pending.keys()]) {
            this.settle(reqId, CHANNEL_CLOSED);
        }
    }

    async received(data: unknown) {
        if (data instanceof Blob) {
            await this.showFrame(data);
            return;
        }
        const msg = typeof data === 'string' ? parseJson(data) : data;
        if (!isRecord(msg)) {
            console.warn('Dropping a relay frame that is not an object:', data);
            return;
        }
        switch (msg.type) {
            case 'robot_state':
                robotConnected.set(msg.connected === true);
                return;
            case 'command_result':
                this.report(msg);
                return;
            case 'state_stream':
                // The robot's telemetry. Nothing displays it yet.
                return;
            default:
                console.warn('Unrecognised relay message:', msg);
        }
    }

    /// Send a command and wait for the relay's verdict on it.
    request(item: CueItem): Promise<Outcome> {
        const reqId = (this.lastRequestId += 1);
        const label = labelOf(item);
        if (!this.send({ ...item, reqId })) {
            recordOutcome({ ...CHANNEL_CLOSED, reqId, label, at: Date.now() });
            return Promise.resolve(CHANNEL_CLOSED);
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => this.settle(reqId, RELAY_SILENT), REPLY_BACKSTOP_MS);
            this.pending.set(reqId, { resolve, timer, label });
        });
    }

    /// Write one message to the relay, answering whether it went. A closed channel is a fact
    /// the caller has to handle, so this never throws: an exception here is what leaves a
    /// control showing a state the robot never entered.
    send(msg: unknown): boolean {
        if (!this.socket || this.socket.readyState !== OPEN) return false;
        try {
            this.socket.send(JSON.stringify(msg));
            return true;
        } catch (error) {
            console.error('Failed to write to the control channel:', error);
            return false;
        }
    }

    private report(msg: Record<string, unknown>) {
        const outcome = readOutcome(msg);
        const reqId = typeof msg.reqId === 'number' ? msg.reqId : null;
        if (reqId !== null && this.pending.has(reqId)) {
            this.settle(reqId, outcome);
            return;
        }
        // A command sent through `send` carries no reqId, and a verdict can arrive after the
        // backstop has already answered its caller. The log shows both.
        const label = typeof msg.command_name === 'string' ? msg.command_name : 'command';
        recordOutcome({ ...outcome, reqId, label, at: Date.now() });
    }

    private settle(reqId: number, outcome: Outcome) {
        const pending = this.pending.get(reqId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(reqId);
        recordOutcome({ ...outcome, reqId, label: pending.label, at: Date.now() });
        pending.resolve(outcome);
    }

    private async showFrame(blob: Blob) {
        try {
            const bitmap = await createImageBitmap(blob);
            this.previousBitmap?.close();
            this.previousBitmap = bitmap;
            videoFrame.set(bitmap);
        } catch (error) {
            console.error('Failed to decode video frame:', error);
        }
    }
}

export let websocket = new WebSocketClient();
