import type { Posture } from './robotState';

/// The working zero-argument commands, under the SPORT_MOD topic. `exec_time` is how long the
/// motion lasts, in seconds; the 1s and 10s values were never measured. `posture` is the posture
/// the action ends in, inferred from its name.
export const ACTIONS = {
    BalanceStand: { api_id: 1002, exec_time: 1, description: 'Enters balanced standing state' },
    StopMove: { api_id: 1003, exec_time: 1, description: '' },
    StandUp: { api_id: 1004, exec_time: 1.88, description: '', posture: 'standing' },
    StandDown: {
        api_id: 1005,
        exec_time: 2.26,
        description: 'Lies down on the ground from standing position',
        posture: 'lying',
    },
    RecoveryStand: {
        api_id: 1006,
        exec_time: 1,
        description: 'Recovers to standing position from a fall',
    },
    Sit: { api_id: 1009, exec_time: 10, description: 'Sits the robot down', posture: 'sitting' },
    RiseSit: {
        api_id: 1010,
        exec_time: 10,
        description: 'Rises the robot from a sitting position',
        posture: 'standing',
    },
    Hello: { api_id: 1016, exec_time: 4.23, description: '' },
    Stretch: { api_id: 1017, exec_time: 4.35, description: '' },
    Content: {
        api_id: 1020,
        exec_time: 3.89,
        description: 'The robot taps the floor with its front paws, as if excited',
    },
    Dance1: { api_id: 1022, exec_time: 10, description: 'Executes a scripted dance' },
    Dance2: { api_id: 1023, exec_time: 10, description: 'Executes a scripted dance' },
    Scrape: { api_id: 1029, exec_time: 10, description: '' },
    FrontFlip: { api_id: 1030, exec_time: 4.39, description: 'Executes a front flip' },
    FrontJump: { api_id: 1031, exec_time: 3.56, description: 'Executes a front jump' },
    FrontPounce: { api_id: 1032, exec_time: 10, description: '' },
    FingerHeart: { api_id: 1036, exec_time: 5.72, description: 'The Heart Shape starts at 2"67' },
    LeftFlip: { api_id: 2041, exec_time: 1, description: '' },
    RightFlip: { api_id: 1043, exec_time: 1, description: '' },
    BackFlip: { api_id: 2043, exec_time: 1, description: '' },
} as const satisfies Record<
    string,
    { api_id: number; exec_time: number; description: string; posture?: Posture }
>;

export type Action = keyof typeof ACTIONS;
