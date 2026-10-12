import { isIncludedIn, pick } from 'remeda';
import { cueLabel } from './commands';
import type { Cue } from './commands';
import { encode } from './encode';
import { OUTCOME_NAMES, clearOutcomes, recordOutcome } from '../stores/outcomes';
import type { Outcome } from '../stores/outcomes';
import { robotConnected, videoFrame, webSocketConnected } from '../stores/connection';

/// Every JSON message the relay sends. Video frames arrive separately, as binary.
type RelayMessage =
    | { type: 'robot_state'; connected: boolean }
    | (Outcome & { type: 'command_result'; reqId: number | null; command_name: string | null })
    | { type: 'state_stream'; data: unknown };

const RELAY_URL = 'ws://localhost:8000/ws';

// WebSocket.readyState values, named so the tests need no browser global.
const OPEN = 1;
const CLOSED = 3;

/// The relay bounds a command at max(5s, exec_time + 3s), at most 13s with the longest
/// exec_time (10s), so this fires only once the relay has stopped answering.
const REPLY_BACKSTOP_MS = 20_000;

/// A command that never left the browser did not run: a failure, not a silence.
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

/// The part of a WebSocket this client writes to, so a test can supply a recorder.
export type Sink = { readyState: number; send(data: string): void };

/// Null for a frame that is not JSON. An outcome this browser does not know reads as
/// `unknown`, never as a confirmation.
function parseRelayMessage(_raw: string) {
    try {
        const msg = JSON.parse(_raw);
        const outcome = isIncludedIn(msg.outcome, OUTCOME_NAMES) ? msg.outcome : 'unknown';
        return (msg.type === 'command_result' ? { ...msg, outcome } : msg) as RelayMessage;
    } catch {
        return null;
    }
}

export class WebSocketClient {
    private socket: Sink | null = null;
    private previousBitmap: ImageBitmap | null = null;
    private pending = new Map<
        number,
        { resolve: (outcome: Outcome) => void; timer: ReturnType<typeof setTimeout>; label: string }
    >();
    private lastRequestId = 0;

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
        for (const reqId of [...this.pending.keys()]) {
            this.settle(reqId, CHANNEL_CLOSED);
        }
    }

    async received(data: Blob | string) {
        if (data instanceof Blob) {
            await this.showFrame(data);
            return;
        }
        const msg = parseRelayMessage(data);
        if (msg === null) {
            console.warn('Dropping a relay frame that is not JSON:', data);
            return;
        }
        switch (msg.type) {
            case 'robot_state':
                robotConnected.set(msg.connected);
                return;
            case 'command_result': {
                const outcome = pick(msg, ['outcome', 'code', 'detail']);
                if (msg.reqId !== null && this.pending.has(msg.reqId)) {
                    this.settle(msg.reqId, outcome);
                    return;
                }
                // A command sent without a reqId, or a verdict that arrived after the backstop.
                const label = msg.command_name ?? 'command';
                recordOutcome({ ...outcome, reqId: msg.reqId, label, at: Date.now() });
                return;
            }
            case 'state_stream':
                // The robot's telemetry. Nothing displays it yet.
                return;
            default:
                console.warn('Unrecognised relay message:', msg satisfies never);
        }
    }

    /// Send a cue and wait for the relay's verdict on it.
    request(cue: Cue): Promise<Outcome> {
        const reqId = (this.lastRequestId += 1);
        const label = cueLabel(cue);
        if (!this.send({ ...encode(cue), reqId })) {
            recordOutcome({ ...CHANNEL_CLOSED, reqId, label, at: Date.now() });
            return Promise.resolve(CHANNEL_CLOSED);
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => this.settle(reqId, RELAY_SILENT), REPLY_BACKSTOP_MS);
            this.pending.set(reqId, { resolve, timer, label });
        });
    }

    /// Never throws: a closed channel is an answer the caller must handle.
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

export const websocket = new WebSocketClient();
