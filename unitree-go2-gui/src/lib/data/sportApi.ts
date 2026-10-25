/// The requests of Unitree's sport API, under the SPORT_MOD topic, by their names in unitree_sdk2's
/// `sport_api.hpp`. `flag` marks a request that takes `{data: boolean}`: true enters its mode, false
/// leaves it. Every other request takes no argument.
export const SPORT_API = {
    Damp: { api_id: 1001, description: 'Enters damped state' },
    BalanceStand: { api_id: 1002, description: 'Enters balanced standing state' },
    StopMove: { api_id: 1003, description: '' },
    StandUp: { api_id: 1004, description: '' },
    StandDown: { api_id: 1005, description: 'Lies down on the ground from standing position' },
    RecoveryStand: { api_id: 1006, description: 'Recovers to standing position from a fall' },
    Sit: { api_id: 1009, description: 'Sits the robot down' },
    RiseSit: { api_id: 1010, description: 'Rises the robot from a sitting position' },
    Hello: { api_id: 1016, description: '' },
    Stretch: { api_id: 1017, description: '' },
    /// Not in unitree_sdk2; the MCF firmware accepts it.
    ContinuousGait: {
        api_id: 1019,
        flag: true,
        description: 'Toggles the mode where the robot is continuously stepping, even when not moving',
    },
    Content: {
        api_id: 1020,
        description: 'The robot taps the floor with its front paws, as if excited',
    },
    Dance1: { api_id: 1022, description: 'Executes a scripted dance' },
    Dance2: { api_id: 1023, description: 'Executes a scripted dance' },
    Pose: {
        api_id: 1028,
        flag: true,
        description:
            'Enters a state where the robot holds a pose defined by the Euler angles, but cannot move',
    },
    Scrape: { api_id: 1029, description: '' },
    FrontFlip: { api_id: 1030, description: 'Executes a front flip' },
    FrontJump: { api_id: 1031, description: 'Executes a front jump' },
    FrontPounce: { api_id: 1032, description: '' },
    Heart: { api_id: 1036, description: 'The Heart Shape starts at 2"67' },
    /// No source for the MCF firmware lists this request.
    RightFlip: { api_id: 1043, description: '' },
    StaticWalk: {
        api_id: 1061,
        flag: true,
        description: 'Déplacement dit Normal, avec des pas parasites en fin de mouvement',
    },
    TrotRun: { api_id: 1062, flag: true, description: '' },
    EconomicGait: {
        api_id: 1063,
        flag: true,
        description: 'Déplacement assez similaire à Static Walk, mais un peu plus lent',
    },
    LeftFlip: { api_id: 2041, description: '' },
    BackFlip: { api_id: 2043, description: '' },
    HandStand: {
        api_id: 2044,
        flag: true,
        description: 'Toggles the mode in which the Go2 stands on its front legs',
    },
    FreeWalk: { api_id: 2045, flag: true, description: '' },
    FreeBound: {
        api_id: 2046,
        flag: true,
        description:
            'Toggles a displacement mode where the robot moves by bounding around. Also known as Free Bound',
    },
    FreeJump: {
        api_id: 2047,
        flag: true,
        description:
            'Toggles a displacement mode where the robot moves by hopping around. Also known as Free Jump',
    },
    FreeAvoid: { api_id: 2048, flag: true, description: '' },
    ClassicWalk: {
        api_id: 2049,
        flag: true,
        description:
            'Comme le mode par défaut (FreeWalk?) mais en plus lent et plus pataud. Correspond à Normal sur la télécommande',
    },
    WalkUpright: {
        api_id: 2050,
        flag: true,
        description:
            'Toggles the mode in which the Go2 stands on its hind legs. Also known as Erect or WalkUpright. ',
    },
    CrossStep: {
        api_id: 2051,
        flag: true,
        description:
            'Toggles the mode in which the Go2 balances itself on its front left and rear right legs. ',
    },
} as const satisfies Record<string, { api_id: number; flag?: true; description: string }>;
