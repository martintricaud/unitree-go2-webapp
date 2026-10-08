import { buildPayload, changeTo, dimTo, switchTo } from '../utils/payloads';
import type { Sequence } from '../utils/payloads';

export const DANSE_DU_SABBAT = {
    kind: 'sequence',
    displayName: 'Sabbat',
    sequence: [
        switchTo(true)('FreeWalk'),
        switchTo(true)('Pose'),
        {
            kind: 'sequence',
            displayName: 'Sabots',
            sequence: [
                switchTo(true)('FreeWalk'),
                { kind: 'wait', wait: 0.1 },
                switchTo(true)('Backstand'),
                { kind: 'wait', wait: 0.1 },
                changeTo('blue')('Headlight')

            ],
        },
        {
            kind: 'sequence',
            displayName: 'Wizard of Oz',
            sequence: [
                switchTo(true)('ClassicWalk'),
                { kind: 'wait', wait: 0.1 },
                changeTo('green')('Headlight')

            ],
        },
    ]
} satisfies Sequence;

/// Cue items the operator fires from a key or a button rather than from the cue sheet.
export const presets = {
    stopAndCrouch: {
        kind: 'sequence',
        sequence: [
            buildPayload('StopMove'),
            buildPayload('StandDown'),
        ]
    },
    stopAndStand: {
        kind: 'sequence',
        sequence: [
            buildPayload('StopMove'),
            buildPayload('StandUp'),
        ]
    },
    holdAim: {
        kind: 'sequence',
        sequence: [
            { ...buildPayload('Euler'), parameter: { x: 0, y: -1, z: 0 } },
        ]

    },
    aimAtPublic: {
        kind: 'sequence',
        sequence: [
            buildPayload('StopMove'),
            switchTo(true)('Pose'),
            { kind: 'wait', wait: 0.1 },
            { ...buildPayload('Euler'), parameter: { x: 0, y: -1, z: 0 } },
            { kind: 'wait', wait: 0.1 },
            { ...buildPayload('Euler'), parameter: { x: 0, y: -1, z: 0 } },
            { kind: 'wait', wait: 0.1 },
            { ...buildPayload('Euler'), parameter: { x: 0, y: -1, z: 0 } },
        ],
    },
    stopAimAtPublic: {
        kind: 'sequence',
        sequence: [
            { ...buildPayload('Euler'), parameter: { vx: 0, vy: 0, vyaw: 0 } },
            { kind: 'wait', wait: 0.1 },
            switchTo(true)('FreeWalk'),
        ]
    },
    contentRed: {
        kind: 'sequence',
        sequence: [
            changeTo('red')('Headlight'),
            { kind: 'wait', wait: 0.1 },
            buildPayload('Content'),
            { kind: 'wait', wait: 0.5 },
            switchTo(true)('FreeWalk'),
        ],
    },

    standContent: {
        kind: 'sequence',
        sequence: [
            { kind: 'wait', wait: 0.1 },
            buildPayload('BalanceStand'),
            { kind: 'wait', wait: 0.1 },
            switchTo(true)('FreeWalk'),
            { kind: 'wait', wait: 0.1 },
            buildPayload('Content'),
            { kind: 'wait', wait: 0.1 },
            switchTo(true)('FreeWalk'),
            { kind: 'wait', wait: 0.1 },
        ],
    },
    exitSit: {
        kind: 'sequence',
        sequence: [
            buildPayload('RiseSit'),
            switchTo(true)('FreeWalk'),
        ],
    },
    exitPose: {
        kind: 'sequence',
        sequence: [
            switchTo(false)('Pose'),
            { kind: 'wait', wait: 0.1 },
            switchTo(true)('FreeWalk'),
        ],
    },
    enterPose: {
        kind: 'sequence',
        sequence: [
            buildPayload('StopMove'),
            switchTo(true)('Pose'),
        ],
    },
    dance: {
        kind: 'sequence',
        displayName: 'Dance',
        sequence: [
            buildPayload('Dance2'),
            { kind: 'wait', wait: 0.1 },
            switchTo(true)('FreeWalk'),
        ],
    }
} satisfies Record<string, Sequence>;

const STRETCH_HELLO_JUMP = {
    kind: 'sequence',
    displayName: 'Stretch 👋 Jump',
    sequence: [
        buildPayload('StopMove'),
        { kind: 'wait', wait: 0.1 },
        buildPayload('Stretch'),
        buildPayload('Hello'),
        { kind: 'wait', wait: 0.3 },
        buildPayload('FrontJump'),
        { kind: 'wait', wait: 0.6 },
        buildPayload('FrontJump'),
        { kind: 'wait', wait: 0.1 },
        switchTo(true)('FreeWalk'),
    ],
} satisfies Sequence;

const MONOLOGUE = {
    kind: 'sequence',
    displayName: 'Monologue',
    sequence: [
        buildPayload('Sit'),
        { ...presets.exitSit, displayName: 'FreeWalk' },
        {
            kind: 'sequence',
            displayName: 'Chien',
            sequence: [
                switchTo(true)('Leaping')
            ],
        },
        switchTo(true)('FreeWalk'),
        {...presets.dance},
        // buildPayload('Content'),
        // {
        //     displayName: 'Visée Public 1',
        //     sequence: [
        //         buildPayload('StopMove'),
        //         switchTo(true)('Pose'),
        //     ],
        // },

        // switchTo(true)('FreeWalk'),
        // {
        //     displayName: 'Visée Public 2',
        //     sequence: [
        //         buildPayload('StopMove'),
        //         switchTo(true)('Pose'),
        //     ],
        // },
        // switchTo(true)('FreeWalk'),
        // {
        //     displayName: 'Visée Public 3',
        //     sequence: [
        //         buildPayload('StopMove'),
        //         switchTo(true)('Pose'),
        //     ],
        // },
        // switchTo(true)('FreeWalk'),
        { ...presets.contentRed, displayName: 'Ahahah Redlight' },
        {
            kind: 'sequence',
            displayName: 'Assis Whitelight',
            sequence: [
                buildPayload('StandUp'),
                { kind: 'wait', wait: 0.1 },
                buildPayload('Sit'),
                { kind: 'wait', wait: 0.1 },
                changeTo('white')('Headlight'),
                dimTo(4)('Brightness'),

            ],
        },
        buildPayload('StandDown'),


    ]
} satisfies Sequence;

/// The performance cue sheet, which the operator steps through with the arrow keys.
export const CONDUITE = {
    kind: 'sequence',
    sequence:
        [
            ...DANSE_DU_SABBAT.sequence,
            STRETCH_HELLO_JUMP,
            {
                kind: 'sequence',
                displayName: 'Content',
                sequence: [
                    buildPayload('Content'),
                    { kind: 'wait', wait: 0.05 },
                    switchTo(true)('FreeWalk'),
                ],
            },
            {
                kind: 'sequence',
                displayName: 'Picture me...',
                sequence: [
                    buildPayload('StopMove'),
                    switchTo(true)('Pose'),
                ],
            },
            switchTo(true)('Handstand'),
            switchTo(true)('ClassicWalk'),
            buildPayload('FingerHeart'),
            {
                kind: 'sequence',
                displayName: 'Salto',
                sequence: [
                    buildPayload('LeftFlip'),
                    switchTo(true)('FreeWalk'),
                ],
            },
            ...MONOLOGUE.sequence,
        ]
} satisfies Sequence;
