/// The headlight colours the operator can pick, each with the emoji that stands for it.
export const LIGHT_EMOJIS = {
    white: '🤍',
    red: '❤️',
    yellow: '💛',
    blue: '💙',
    green: '💚',
    cyan: '🩵',
    purple: '💜',
} as const;

export type Colour = keyof typeof LIGHT_EMOJIS;

/// The `data` value `SpeedLevel` sends for each speed the operator can pick.
export const SPEED_LEVELS = { slow: -1, normal: 0, fast: 1 } as const;

export type Speed = keyof typeof SPEED_LEVELS;
