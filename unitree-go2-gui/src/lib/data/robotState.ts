import type { Mode } from './modes';
import type { Colour, SpeedLevel } from './options';

export type Posture = 'standing' | 'sitting' | 'lying';

export type RobotState = {
    /// Null once a mode was left: the API does not say which mode follows.
    mode: Mode | null;
    posture: Posture;
    headlight: Colour;
    speed: SpeedLevel;
    obstacleAvoidance: boolean;
};

export const INITIAL_ROBOT_STATE: RobotState = {
    mode: 'FreeWalk',
    posture: 'standing',
    headlight: 'white',
    speed: 0,
    obstacleAvoidance: true,
};
