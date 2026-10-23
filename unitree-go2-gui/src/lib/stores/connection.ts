import { writable } from 'svelte/store';
import type { Mode } from '../data/sportCommands';
import type { RobotState } from '../utils/commands';

/// Whether the browser's control channel to the relay is open.
export const webSocketConnected = writable(false);

/// Whether the relay reports a live WebRTC session with the robot.
export const robotConnected = writable(false);

/// The latest decoded frame of the robot's camera, or null before the first one arrives.
export const videoFrame = writable<ImageBitmap | null>(null);

export const NO_ROBOT_SETTINGS: {
    [K in keyof Pick<RobotState, 'speed' | 'obstacleAvoidance'>]: RobotState[K] | null;
} = { speed: null, obstacleAvoidance: null };

/// The robot's last report of each field it states, or null until the robot reports it while
/// both the robot and the control channel are up.
export const robotSettings = writable(NO_ROBOT_SETTINGS);

/// The mode the robot last reported, or null when its last report named no mode, or when the robot
/// or the control channel was lost since.
export const robotMode = writable<Mode | null>(null);
