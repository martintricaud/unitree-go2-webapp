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
export let buildPayload = (cmd: string): Pick<Command, 'api_id' | 'topic' | 'command_name'> => pick(commandIndex[cmd], ['api_id', 'topic', 'command_name']);
///utility for generating "toggle switch on" JSON messages
export let switchTo = (newState: boolean) => (cmd: string) => {
    modeGroupData.update((s) => ({ ...s, currentOption: newState ? cmd : 'FreeWalk' }))
    return {
        parameter: { [commandIndex[cmd].args[0].name]: newState },
        ...buildPayload(cmd)

    }
};


let changeTo = (newValue: any) => (cmd: string) => {
    return {
        parameter: { color: newValue },
        ...buildPayload(cmd)
    }
}

export let DANSE_DU_SABBAT = [
    switchTo(true)('FreeWalk'),
    switchTo(true)('Pose'),
    {
        displayName: 'Sabots',
        sequence: [
            switchTo(true)('FreeWalk'),
            { wait: 0.1 },
            switchTo(true)('Backstand'),
            { wait: 0.1 },
            changeTo('blue')('Headlight')

        ],
    },
    {
        displayName: 'Wizard of Oz',
        sequence: [
            switchTo(true)('ClassicWalk'),
            { wait: 0.1 },
            changeTo('green')('Headlight')

        ],
    },
];

export let STRETCH_HELLO_JUMP = {
    displayName: 'Strello Jump',
    sequence: [
        buildPayload('StopMove'),
        { wait: 0.1 },
        buildPayload('Stretch'),
        buildPayload('Hello'),
        { wait: 0.3 },
        buildPayload('FrontJump'),
        { wait: 0.6 },
        buildPayload('FrontJump'),
        { wait: 0.1 },
        switchTo(true)('FreeWalk'),
    ],
};

export let CONDUITE = [
    ...DANSE_DU_SABBAT,
    STRETCH_HELLO_JUMP,
    {
        displayName: 'Content',
        sequence: [
            buildPayload('Content'),
            { wait: 0.05 },
            switchTo(true)('FreeWalk'),
        ],
    },
    {
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
        displayName: 'Salto',
        sequence: [
            buildPayload('LeftFlip'),
            switchTo(true)('FreeWalk'),
        ],
    },

];


export let presets = {
    stopAndCrouch: {
        sequence: [
            buildPayload('StopMove'),
            buildPayload('StandDown'),
        ]
    },
    stopAndStand: {
        sequence: [
            buildPayload('StopMove'),
            buildPayload('StandUp'),
        ]
    },
    holdAim: {
        sequence: [
            { ...buildPayload('Euler'), parameter: { x: 0, y: -1, z: 0 } },
        ]

    },
    aimAtPublic: {
        sequence: [
            buildPayload('StopMove'),
            switchTo(true)('Pose'),
            { wait: 0.1 },
            { ...buildPayload('Euler'), parameter: { x: 0, y: -1, z: 0 } },
            { wait: 0.1 },
            { ...buildPayload('Euler'), parameter: { x: 0, y: -1, z: 0 } },
            { wait: 0.1 },
            { ...buildPayload('Euler'), parameter: { x: 0, y: -1, z: 0 } },
        ],
    },
    stopAimAtPublic: {
        sequence: [
            { ...buildPayload('Euler'), parameter: { vx: 0, vy: 0, vyaw: 0 } },
            { wait: 0.1 },
            switchTo(true)('FreeWalk'),
        ]
    },
    contentRed: {
        sequence: [
            changeTo('ref')('Headlight'),
            { wait: 0.1 },
            buildPayload('Content'),
            { wait: 0.5 },
            switchTo(true)('FreeWalk'),
        ],
    },

    standContent: {
        sequence: [
            { wait: 0.1 },
            buildPayload('BalanceStand'),
            { wait: 0.1 },
            switchTo(true)('FreeWalk'),
            { wait: 0.1 },
            buildPayload('Content'),
            { wait: 0.1 },
            switchTo(true)('FreeWalk'),
            { wait: 0.1 },
        ],
    },
    exitSit: {
        sequence: [
            buildPayload('RiseSit'),
            switchTo(true)('FreeWalk'),
        ],
    },
    exitPose: {
        sequence: [
            switchTo(false)('Pose'),
            switchTo(true)('FreeWalk'),
        ],
    },
    enterPose: {
        sequence: [
            buildPayload('StopMove'),
            switchTo(true)('Pose'),
        ],
    },
    dance: {
        sequence: [
            buildPayload('Dance2'),
            { wait: 0.1 },
            switchTo(true)('FreeWalk'),
        ],
    }
};
export let execute_step = (_websocket: WebSocketClient) => (_actionSequence: any) => (i: number) => {
    _websocket.send(_actionSequence[i]);
};