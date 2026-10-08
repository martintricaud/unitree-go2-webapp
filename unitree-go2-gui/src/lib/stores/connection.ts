import { writable } from 'svelte/store';

/// Whether the browser's control channel to the relay is open.
export const webSocketConnected = writable(false);

/// Whether the relay reports a live WebRTC session with the robot.
export const robotConnected = writable(false);

/// The latest decoded frame of the robot's camera, or null before the first one arrives.
export const videoFrame = writable<ImageBitmap | null>(null);
