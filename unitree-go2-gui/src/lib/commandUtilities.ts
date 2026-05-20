import * as R from 'ramda'
import commands from '../../../commands_1.1.7.json';
    import { derived, get, writable } from 'svelte/store';
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

let indexByCommandName: (list: Command[]) => Record<string, Command> = R.indexBy(
    R.prop('command_name'),
);
let commandIndex = indexByCommandName(commands as Command[]);

export const CMD_actions: Command[] = R.filter((x: Command) => x.args.length == 0 && x.working)(
    commands as Command[],
);
export const CMD_switches: Command[] = R.filter(
    (cmd: Command) => cmd.working && cmd.args!.length === 1 && cmd.args![0].type === 'boolean',
)(commands as Command[]) as Command[];
export const CMD_switches_names: string[] = CMD_switches.map((command) => command.command_name);
export const modeGroupData = writable({ options: CMD_switches_names, currentOption: 'FreeWalk' });

///utility for generating a JSON message containing the api_id and topic fields
export let buildPayload = (cmd: string) => R.pick(['api_id', 'topic'], commandIndex[cmd]);
export let buildPayload2 = (cmd: string) => R.pick(['api_id', 'topic', 'command_name'], commandIndex[cmd]);
///utility for generating "toggle switch on" JSON messages
export let switchTo = (newState: boolean) => (cmd: string) => {
    modeGroupData.update(R.assoc('currentOption',newState?cmd:'FreeWalk'))
    return {
        parameter: R.objOf(commandIndex[cmd].args[0].name, newState),
        ...buildPayload2(cmd)

    }
};


let changeTo2 = (newValue: any) => (cmd: string) => {
    return {
        parameter: { color: newValue },
        ...buildPayload2(cmd)
    }
}

let changeTo = (newValue: any) => (cmd: string) => {
    return { parameter: { color: newValue } };
};

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
            changeTo2('blue')('Headlight')
            // { command_name: 'Headlight', ...changeTo('blue')('Headlight'), ...buildPayload('Headlight') },
        ],
    },
    {
        displayName: 'Wizard of Oz',
        sequence: [
            switchTo(true)('ClassicWalk'),
            { wait: 0.1 },
            changeTo2('green')('Headlight')
            // { command_name: 'Headlight', ...changeTo('green')('Headlight'), ...buildPayload('Headlight') },
        ],
    },
];

export let STRETCH_HELLO_JUMP = {
    displayName: 'Strello Jump',
    sequence: [
        buildPayload2('StopMove'),
        { wait: 0.1 },
        buildPayload2('Stretch'),
        buildPayload2('Hello'),
        { wait: 0.3 },
        buildPayload2('FrontJump'),
        { wait: 0.6 },
        buildPayload2('FrontJump'),
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
            buildPayload2('Content'),
            { wait: 0.05 },
            switchTo(true)('FreeWalk'),
        ],
    },
    {
        displayName: 'Picture me...',
        sequence: [
            buildPayload2('StopMove'),
            switchTo(true)('Pose'),
        ],
    },
    switchTo(true)('Handstand'),
    switchTo(true)('ClassicWalk'),
    buildPayload2('FingerHeart'),
    {
        displayName: 'Salto',
        sequence: [
            buildPayload2('LeftFlip'),
            switchTo(true)('FreeWalk'),
        ],
    },

];


export let presets = {
    stopAndCrouch: {
        sequence:[
            buildPayload2('StopMove'),
            buildPayload2('StandDown'),
        ]
    },
        stopAndStand: {
        sequence:[
            buildPayload2('StopMove'),
            buildPayload2('StandUp'),
        ]
    },
    holdAim: {
        sequence: [
            { command_name: 'Euler', parameter: { x: 0, y: -1, z: 0 }, ...buildPayload('Euler') },
        ]

    },
    aimAtPublic: {
        sequence: [
            buildPayload2('StopMove'),
            switchTo(true)('Pose'),
            { wait: 0.1 },
            { command_name: 'Euler', parameter: { x: 0, y: -1, z: 0 }, ...buildPayload('Euler') },
            { wait: 0.1 },
            { command_name: 'Euler', parameter: { x: 0, y: -1, z: 0 }, ...buildPayload('Euler') },
            { wait: 0.1 },
            { command_name: 'Euler', parameter: { x: 0, y: -1, z: 0 }, ...buildPayload('Euler') },
        ],
    },
    stopAimAtPublic: {
        sequence: [
            { command_name: 'Euler', parameter: { vx: 0, vy: 0, vyaw: 0 }, ...buildPayload('Euler') },
            { wait: 0.1 },
            switchTo(true)('FreeWalk'),
        ]
    },
    contentRed: {
        sequence: [
            changeTo2('ref')('Headlight'),
            // { command_name: 'Headlight', ...changeTo('red')('Headlight'), ...buildPayload('Headlight') },
            { wait: 0.1 },
            buildPayload2('Content'),
            { wait: 0.5 },
            switchTo(true)('FreeWalk'),
        ],
    },

    standContent: {
        sequence: [
            { wait: 0.1 },
            buildPayload2('BalanceStand'),
            { wait: 0.1 },
            switchTo(true)('FreeWalk'),
            { wait: 0.1 },
            buildPayload2('Content'),
            { wait: 0.1 },
            switchTo(true)('FreeWalk'),
            { wait: 0.1 },
        ],
    },
    exitSit: {
        sequence: [
            buildPayload2('RiseSit'),
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
            buildPayload2('StopMove'),
            switchTo(true)('Pose'),
        ],
    },
    dance: {
        sequence: [
            buildPayload2('Dance2'),
            { wait: 0.1 },
            switchTo(true)('FreeWalk'),
        ],
    }
};
export let execute_step = (_websocket: WebSocket) => (_actionSequence: any) => (i: number) => {
    console.log(_actionSequence[i]);
    _websocket.send(_actionSequence[i]);
};