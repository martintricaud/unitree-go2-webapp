import { writable } from "svelte/store";

type Message = any;
type Listener = (msg: Message) => void;
type StateListener = (state: { webSocketConnected: boolean; robotConnected: boolean }) => void;

const URL = "ws://localhost:8000/ws";

let socket: WebSocket | null = null;

// Using stores lets us easily bind to these values in Svelte components
export const webSocketConnected = writable(false);
export const robotConnected = writable(false);

const msgListeners = new Set<Listener>();
const stateListeners = new Set<StateListener>();

export function connectClient() {
    if (socket) return;

    socket = new WebSocket(URL);

    socket.onopen = () => {
        webSocketConnected.set(true);
    };

    socket.onclose = () => {
        socket = null;
        webSocketConnected.set(false);
        robotConnected.set(false);
      
    };

    socket.onmessage = (ev) => {
        let msg: any;
        try {
            msg = JSON.parse(ev.data);
        } catch {
            msg = ev.data;
        }

        if (msg.type === "robot_state") {
            robotConnected.set(msg.connected);
        }

        for (const fn of msgListeners) fn(msg);
    };
}

export function send(msg: any) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket not connected");
    }
    socket.send(JSON.stringify(msg));
}

export function onMessage(fn: Listener) {
    msgListeners.add(fn);
    return () => msgListeners.delete(fn);
}

export default { connectClient, send, onMessage};