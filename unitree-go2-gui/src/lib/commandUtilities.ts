import * as R from 'ramda'
import commands from '../../../commands_1.1.7.json';

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

///utility for generating a JSON message containing the api_id and topic fields
export let buildPayload = (cmd: string) => R.pick(['api_id', 'topic'], commandIndex[cmd]);
///utility for generating "toggle switch on" JSON messages
export let switchTo = (newState: boolean) => (cmd: string) => {
    return { parameter: R.objOf(commandIndex[cmd].args[0].name, newState) };
};

let changeTo = (newValue: any) => (cmd: string) => {
    return { parameter: { color: newValue } };
};

export let DANSE_DU_SABBAT = [
    { command: 'FreeWalk', ...switchTo(true)('FreeWalk'), ...buildPayload('FreeWalk') },
    { command: 'Pose', ...switchTo(true)('Pose'), ...buildPayload('Pose') },
    { command: 'Euler', ...buildPayload('Euler') },
    {
        displayName: 'Sabots',
        sequence: [
            { command: 'FreeWalk', ...switchTo(true)('FreeWalk'), ...buildPayload('FreeWalk') },
            { wait: 0.1 },
            { command: 'Backstand', ...switchTo(true)('Backstand'), ...buildPayload('Backstand') },
            { wait: 0.1 },
            { command: 'Headlight', ...changeTo('blue')('Headlight'), ...buildPayload('Headlight') },
        ],
    },
    {
        displayName: 'Wizard of Oz',
        sequence: [
            { command: 'ClassicWalk', ...switchTo(true)('ClassicWalk'), ...buildPayload('ClassicWalk') },
            { wait: 0.1 },
            { command: 'Headlight', ...changeTo('green')('Headlight'), ...buildPayload('Headlight') },
        ],
    },
];

export let STRETCH_HELLO_JUMP = {
    displayName: 'Strello Jump',
    sequence: [
        { command: 'StopMove', ...buildPayload('StopMove') },
        { command: 'Stretch', ...buildPayload('Stretch') },
        { command: 'Hello', ...buildPayload('Hello') },
        { wait: 0.3 },
        { command: 'FrontJump', ...buildPayload('FrontJump') },
        { wait: 0.6 },
        { command: 'FrontJump', ...buildPayload('FrontJump') },
        { wait: 0.1 },
        { command: 'FreeWalk', ...switchTo(true)('FreeWalk'), ...buildPayload('FreeWalk') },
    ],
};

export let actionSequence = [
    ...DANSE_DU_SABBAT,
    // { command: 'FreeWalk', ...switchTo(true)('FreeWalk'), ...buildPayload('FreeWalk') },
    STRETCH_HELLO_JUMP,
    {
        displayName: 'Content',
        sequence: [
            { command: 'Content', ...buildPayload('Content') },
            { wait: 0.05 },
            { command: 'FreeWalk', ...switchTo(true)('FreeWalk'), ...buildPayload('FreeWalk') },
        ],
    },
    {
        displayName: 'Picture me...',
        sequence: [
            { command: 'StopMove', ...buildPayload('StopMove') },
            { command: 'Pose', ...switchTo(true)('Pose'), ...buildPayload('Pose') },
        ],
    },
    { command: 'Handstand', ...switchTo(true)('Handstand'), ...buildPayload('Handstand') },
    { command: 'ClassicWalk', ...switchTo(true)('ClassicWalk'), ...buildPayload('ClassicWalk') },
    { command: 'FingerHeart', ...buildPayload('FingerHeart') },
    { command: 'Sit', ...buildPayload('Sit') },
    { command: 'RiseSit', ...buildPayload('RiseSit') },
    { command: 'Jumping', ...switchTo(true)('Jumping'), ...buildPayload('Jumping') },
];

export let execute_step = (_websocket: WebSocket) => (_actionSequence: any) => (i: number) => {
    console.log(_actionSequence[i]);
    _websocket.send(_actionSequence[i]);
};