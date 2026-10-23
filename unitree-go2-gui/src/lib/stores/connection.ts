import { writable } from 'svelte/store';
import type { RobotState } from '../utils/commands';

/// Whether the browser's control channel to the relay is open.
export const webSocketConnected = writable(false);

/// Whether the relay reports a live WebRTC session with the robot.
export const robotConnected = writable(false);

/// The latest decoded frame of the robot's camera, or null before the first one arrives.
export const videoFrame = writable<ImageBitmap | null>(null);

/// The fields the robot stated in its latest report. Each report replaces the value with a new
/// object, so subscribers are notified of every report, including one that repeats the previous values.
export const robotReport = writable<Partial<RobotState>>({});
