/// The commands that enter (true) or leave (false) a gait or a posture, under the SPORT_MOD topic.
/// `argument` names that boolean. `kind` says whether the mode is a gait, in which the robot can
/// move, or a posture, in which it cannot.
export const MODES = {
    Damp: { api_id: 1001, argument: 'enabled', kind: 'posture', description: 'Enters damped state' },
    ContinuousGait: {
        api_id: 1019,
        argument: 'data',
        kind: 'gait',
        description: 'Toggles the mode where the robot is continuously stepping, even when not moving',
    },
    Pose: {
        api_id: 1028,
        argument: 'data',
        kind: 'posture',
        description:
            'Enters a state where the robot holds a pose defined by the Euler angles, but cannot move',
    },
    StaticWalk: {
        api_id: 1061,
        argument: 'data',
        kind: 'gait',
        description: 'Déplacement dit Normal, avec des pas parasites en fin de mouvement',
    },
    Trotting: { api_id: 1062, argument: 'data', kind: 'gait', description: '' },
    EconomicGait: {
        api_id: 1063,
        argument: 'data',
        kind: 'gait',
        description: 'Déplacement assez similaire à Static Walk, mais un peu plus lent',
    },
    Handstand: {
        api_id: 2044,
        argument: 'data',
        kind: 'gait',
        description: 'Toggles the mode in which the Go2 stands on its front legs',
    },
    FreeWalk: { api_id: 2045, argument: 'data', kind: 'gait', description: '' },
    Leaping: {
        api_id: 2046,
        argument: 'data',
        kind: 'gait',
        description:
            'Toggles a displacement mode where the robot moves by bounding around. Also known as Free Bound',
    },
    Jumping: {
        api_id: 2047,
        argument: 'data',
        kind: 'gait',
        description:
            'Toggles a displacement mode where the robot moves by hopping around. Also known as Free Jump',
    },
    FreeAvoid: { api_id: 2048, argument: 'data', kind: 'gait', description: '' },
    ClassicWalk: {
        api_id: 2049,
        argument: 'data',
        kind: 'gait',
        description:
            'Comme le mode par défaut (FreeWalk?) mais en plus lent et plus pataud. Correspond à Normal sur la télécommande',
    },
    Backstand: {
        api_id: 2050,
        argument: 'data',
        kind: 'gait',
        description:
            'Toggles the mode in which the Go2 stands on its hind legs. Also known as Erect or WalkUpright. ',
    },
    CrossStep: {
        api_id: 2051,
        argument: 'data',
        kind: 'gait',
        description:
            'Toggles the mode in which the Go2 balances itself on its front left and rear right legs. ',
    },
} as const satisfies Record<
    string,
    { api_id: number; argument: string; kind: 'gait' | 'posture'; description: string }
>;

export type Mode = keyof typeof MODES;

type ModeOfKind<K> = { [M in Mode]: (typeof MODES)[M]['kind'] extends K ? M : never }[Mode];

/// Gaits the robot reports but the app does not command.
export const REPORTED_GAITS = ['Stairs', 'LeadFollow', 'Rage'] as const;

/// The way the robot moves. In a gait the robot can move, and standing still is part of the gait.
export type Gait = ModeOfKind<'gait'> | (typeof REPORTED_GAITS)[number];

/// A state in which the robot cannot move: a posture mode, or the posture an action ends in.
export type Posture =
    | ModeOfKind<'posture'>
    | NonNullable<Extract<(typeof ACTIONS)[Action], { posture: unknown }>['posture']>;

/// The fields each code states when the robot reports it in `error_code` under the motion-control
/// mode "mcf". The codes are transcribed from the official app by legion1581/unitree_ui; Unitree does
/// not document them. A gait code also states that the robot is in no posture. 1013 is the gait at
/// rest, so it clears the posture and keeps the gait: Unitree's ROS 2 documentation separates
/// balanceStand (standing) from locomotion (moving). 1005 ("move") and 1006 ("hello") are transient
/// and state nothing. ClassicWalk and ContinuousGait have no known code.
export const MCF_CODES = {
    0: { gait: 'FreeWalk', posture: null },
    100: { gait: 'FreeWalk', posture: null },
    1015: { gait: 'StaticWalk', posture: null },
    1016: { gait: 'Trotting', posture: null },
    1017: { gait: 'EconomicGait', posture: null },
    2007: { gait: 'FreeAvoid', posture: null },
    2008: { gait: 'Leaping', posture: null },
    2009: { gait: 'Jumping', posture: null },
    2010: { gait: 'Stairs', posture: null },
    2011: { gait: 'Handstand', posture: null },
    2016: { gait: 'CrossStep', posture: null },
    2017: { gait: 'Backstand', posture: null },
    2019: { gait: 'LeadFollow', posture: null },
    2021: { gait: 'Rage', posture: null },
    1013: { posture: null },
    1001: { posture: 'Damp' },
    1002: { posture: 'JointLock' },
    1004: { posture: 'Lying' },
    1007: { posture: 'Sitting' },
    1091: { posture: 'Pose' },
    1005: {},
    1006: {},
} as const satisfies Record<number, { gait?: Gait; posture?: Posture | null }>;

/// The working zero-argument commands, under the SPORT_MOD topic. `posture` is the posture the
/// action leaves the robot in; null means the robot is back in its gait. An action without
/// `posture` is one-shot: it changes neither the gait nor the posture.
export const ACTIONS = {
    BalanceStand: { api_id: 1002, description: 'Enters balanced standing state', posture: null },
    StopMove: { api_id: 1003, description: '' },
    StandUp: { api_id: 1004, description: '', posture: 'JointLock' },
    StandDown: {
        api_id: 1005,
        description: 'Lies down on the ground from standing position',
        posture: 'Lying',
    },
    RecoveryStand: {
        api_id: 1006,
        description: 'Recovers to standing position from a fall',
        posture: null,
    },
    Sit: { api_id: 1009, description: 'Sits the robot down', posture: 'Sitting' },
    RiseSit: {
        api_id: 1010,
        description: 'Rises the robot from a sitting position',
        posture: null,
    },
    Hello: { api_id: 1016, description: '' },
    Stretch: { api_id: 1017, description: '' },
    Content: {
        api_id: 1020,
        description: 'The robot taps the floor with its front paws, as if excited',
    },
    Dance1: { api_id: 1022, description: 'Executes a scripted dance' },
    Dance2: { api_id: 1023, description: 'Executes a scripted dance' },
    Scrape: { api_id: 1029, description: '' },
    FrontFlip: { api_id: 1030, description: 'Executes a front flip' },
    FrontJump: { api_id: 1031, description: 'Executes a front jump' },
    FrontPounce: { api_id: 1032, description: '' },
    FingerHeart: { api_id: 1036, description: 'The Heart Shape starts at 2"67' },
    LeftFlip: { api_id: 2041, description: '' },
    RightFlip: { api_id: 1043, description: '' },
    BackFlip: { api_id: 2043, description: '' },
} as const satisfies Record<
    string,
    { api_id: number; description: string; posture?: string | null }
>;

export type Action = keyof typeof ACTIONS;
