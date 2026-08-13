import { filter, indexBy, pick, prop } from 'remeda';
import commands from '../../../commands_1.1.7.json';
import { writable } from 'svelte/store';
import type { WebSocketClient } from './webSocketClient';
export type TypeMap = {
    number: number;
    string: string;
    boolean: boolean;
    // Add other types as needed
};

export type CmdJson = {
    keyName: string;
    valueType: keyof TypeMap; // This will be "number", "string", "boolean", etc.
};

export type GenerateTypeFromArray<T extends CmdJson[]> = {
    [K in T[number]as K['keyName']]: TypeMap[K['valueType']];
};

export type CommandArg = {
    name: string;
    type: string;
};

export type Command = {
    command_name: string;
    api_id: number;
    description?: string;
    working: boolean;
    exec_time: number;
    topic: string;
    gamepad_assignment: string;
    args: CommandArg[];
};

export type Payload = {
    kind: 'command';
    api_id: number;
    topic: string;
    command_name: string;
    parameter?: Record<string, any>;
}

export type Wait = {
    kind: 'wait';
    wait: number;
};

export type Sequence = {
    kind: 'sequence';
    displayName?: string;
    sequence: CueItem[];
}

/// `kind` tells the reader of a cue item which of the three shapes it is holding, both in the
/// browser and on the relay, which dispatches on it.
export type CueItem = Payload | Wait | Sequence;

let commandIndex = indexBy(commands as Command[], prop('command_name'));

export const CMD_actions: Command[] = filter(
    commands as Command[],
    (x: Command) => x.args.length == 0 && x.working,
);
export const CMD_switches: Command[] = filter(
    commands as Command[],
    (cmd: Command) => cmd.working && cmd.args!.length === 1 && cmd.args![0].type === 'boolean',
);
export const CMD_switches_names: string[] = CMD_switches.map((command) => command.command_name);
export const modeGroupData = writable({ options: CMD_switches_names, currentOption: 'FreeWalk' });

///utility for generating a JSON message containing the api_id and topic fields
export let buildPayload = (cmd: string): Payload => ({
    kind: 'command',
    ...pick(commandIndex[cmd], ['api_id', 'topic', 'command_name']),
});
///utility for generating "toggle switch on" JSON messages
export let switchTo = (newState: boolean) => (cmd: string): Payload => {
    modeGroupData.update((s) => ({ ...s, currentOption: newState ? cmd : 'FreeWalk' }))
    return {
        parameter: { [commandIndex[cmd].args[0].name]: newState },
        ...buildPayload(cmd)

    }
};

let dimTo = (newValue: number) => (cmd: string): Payload => {
    return {
        parameter: { brightness: newValue },
        ...buildPayload(cmd)
    }
}

let changeTo = (newValue: any) => (cmd: string): Payload => {
    return {
        parameter: { color: newValue },
        ...buildPayload(cmd)
    }
}

export let DANSE_DU_SABBAT: Sequence = {
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
}


export let STRETCH_HELLO_JUMP: Sequence = {
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
};

export let presets: Record<string, Sequence> = {
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
};

const MONOLOGUE: Sequence = {
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
}

export let CONDUITE: Sequence = {
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
}




export let execute_step = (_websocket: WebSocketClient) => (_actionSequence: any) => (i: number) => {
    _websocket.send(_actionSequence[i]);
};
