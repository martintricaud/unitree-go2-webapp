/// The exclusive locomotion modes, under the SPORT_MOD topic. `argument` names the boolean that
/// enters (true) or leaves (false) the mode.
export const MODES = {
    Damp: { api_id: 1001, argument: 'enabled', description: 'Enters damped state' },
    ContinuousGait: {
        api_id: 1019,
        argument: 'data',
        description: 'Toggles the mode where the robot is continuously stepping, even when not moving',
    },
    Pose: {
        api_id: 1028,
        argument: 'data',
        description:
            'Enters a state where the robot holds a pose defined by the Euler angles, but cannot move',
    },
    StaticWalk: {
        api_id: 1061,
        argument: 'data',
        description: 'Déplacement dit Normal, avec des pas parasites en fin de mouvement',
    },
    Trotting: { api_id: 1062, argument: 'data', description: '' },
    EconomicGait: {
        api_id: 1063,
        argument: 'data',
        description: 'Déplacement assez similaire à Static Walk, mais un peu plus lent',
    },
    Handstand: {
        api_id: 2044,
        argument: 'data',
        description: 'Toggles the mode in which the Go2 stands on its front legs',
    },
    FreeWalk: { api_id: 2045, argument: 'data', description: '' },
    Leaping: {
        api_id: 2046,
        argument: 'data',
        description:
            'Toggles a displacement mode where the robot moves by bounding around. Also known as Free Bound',
    },
    Jumping: {
        api_id: 2047,
        argument: 'data',
        description:
            'Toggles a displacement mode where the robot moves by hopping around. Also known as Free Jump',
    },
    FreeAvoid: { api_id: 2048, argument: 'data', description: '' },
    ClassicWalk: {
        api_id: 2049,
        argument: 'data',
        description:
            'Comme le mode par défaut (FreeWalk?) mais en plus lent et plus pataud.Correspond à Normal sur la télécommande',
    },
    Backstand: {
        api_id: 2050,
        argument: 'data',
        description:
            'Toggles the mode in which the Go2 stands on its hind legs. Also known as Erect or WalkUpright. ',
    },
    CrossStep: {
        api_id: 2051,
        argument: 'data',
        description:
            'Toggles the mode in which the Go2 balances itself on its front left and rear right legs. ',
    },
} as const;

export type Mode = keyof typeof MODES;
