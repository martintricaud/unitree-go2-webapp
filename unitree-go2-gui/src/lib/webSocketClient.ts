import { writable } from "svelte/store";

// Using stores lets us easily bind to these values in Svelte components
export const webSocketConnected = writable(false);
export const robotConnected = writable(false);
export const videoFrame = writable<ImageBitmap | null>(null)
export const robotData = writable();

export class WebSocketClient {
    private socket: WebSocket | null = null;
    private previousBitmap: ImageBitmap | null = null;
    public onTrackCallback:  (stream: MediaStream) => void = () => {};

    connect() {
        if (this.socket && this.socket.readyState < WebSocket.CLOSED) return;
        const ws = new WebSocket("ws://localhost:8000/ws");
        ws.onopen = () => {
            webSocketConnected.set(true);
        };

        ws.onclose = () => {
            webSocketConnected.set(false);
            robotConnected.set(false);
            this.previousBitmap?.close();
            this.previousBitmap = null;
        };

        ws.onmessage = async (ev) => {
            let msg: any;
            try {
                msg = JSON.parse(ev.data);
            } catch {
                msg = ev.data;
            }

            if (msg.type === "robot_state") {
                robotConnected.set(msg.connected);
            }
            else if (msg.topic === 'rt/lf/sportmodestate'){
                console.log(msg)
            }
            else if (msg.type ==="state_stream"){
                console.log(msg)
            }
            else if (msg instanceof Blob) {
                try {
                    const bitmap = await createImageBitmap(msg);
                    this.previousBitmap?.close();
                    this.previousBitmap = bitmap;
                    videoFrame.set(bitmap);
                } catch (err) {
                    console.error("Failed to decode video frame:", err);
                }
            } 
            else {
                msg = ev.data
                console.log(msg)
                robotData.set(msg)
            }
        };
        this.socket = ws
    }

    
    send(msg: any) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error("WebSocket not connected");
        }
        this.socket.send(JSON.stringify(msg));
    }
}


// export const websocket = new WebSocketClient();
export let websocket = new WebSocketClient()