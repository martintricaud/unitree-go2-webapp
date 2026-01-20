<script lang="ts">
    import * as R from 'ramda';
    import { onMount } from 'svelte';
    import { derived, get } from 'svelte/store';
    import {
        Checkbox,
        Element,
        ThemeUtils,
        RadioGrid,
        Button,
        Pane,
        type RadioGridChangeEvent,
    } from 'svelte-tweakpane-ui';
    import commands from '../../commands_1.1.7.json';
    import { websocket, webSocketConnected, robotConnected } from './lib/webSocketClient';
    import { speedChangeMessage, gaitChangeMessage } from './lib/messageGenerators';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import GamepadController from './components/GamepadController.svelte';
    import { gamepadStore } from './lib/gamepadStore';
    ThemeUtils.setGlobalDefaultTheme(ThemeUtils.presets.retro);

    type TypeMap = {
        number: number;
        string: string;
        boolean: boolean;
        // Add other types as needed
    };

    type CmdJson = {
        keyName: string;
        valueType: keyof TypeMap; // This will be "number", "string", "boolean", etc.
    };

    type GenerateTypeFromArray<T extends CmdJson[]> = {
        [K in T[number] as K['keyName']]: TypeMap[K['valueType']];
    };

    type CommandArg = {
        name: string;
        type: string;
    };

    type Command = {
        command_name: string;
        api_id: number;
        description?: string;
        working: boolean;
        exec_time: number;
        topic: string;
        gamepad_assignment: string;
        args: CommandArg[];
    };

    type InputEvent<T> = {
        index: number;
        value: T;
        timestamp: number;
    };

    type NonEmptyArray<T> = [T, ...T[]];
    type EventsArray<T> = InputEvent<T>[];

    let OBSTACLE_AVOIDANCE = true;
    let MONITOR_STATE = true;
    let FACE_DETECTION = false;
    let FACE_LANDMARKS = false;
    let GENDER_PREDICTION = false;
    let AGE_PREDICTION = false;
    let buttonsStore = derived(gamepadStore, ($gamepadStore) => $gamepadStore.buttonsState);
    let axisStore = derived(gamepadStore, ($gamepadStore) => $gamepadStore.axisState);

    let indexByCommandName: (list: Command[]) => Record<string, Command> = R.indexBy(
        R.prop('command_name'),
    );
    let commandIndex = indexByCommandName(commands as Command[]);

    ///utility for generating a JSON message containing the api_id and topic fields
    let buildPayload = (cmd: string) => R.pick(['api_id', 'topic'], commandIndex[cmd]);
    ///utility for generating "toggle switch on" JSON messages
    let switchTo = (newState: boolean) => (cmd: string) => {
        return { parameter: R.objOf(commandIndex[cmd].args[0].name, newState) };
    };

    let stepCounter = 0;
    let claquettes = {
        sequence: [
            { command: 'CrossStep', ...switchTo(true)('CrossStep'), ...buildPayload('CrossStep') },
            { wait: 0.15 },
            {
                command: 'ClassicWalk',
                ...switchTo(true)('ClassicWalk'),
                ...buildPayload('ClassicWalk'),
            },
            { wait: 0.15 },
            { command: 'CrossStep', ...switchTo(true)('CrossStep'), ...buildPayload('CrossStep') },
            { wait: 0.15 },
            {
                command: 'ClassicWalk',
                ...switchTo(true)('ClassicWalk'),
                ...buildPayload('ClassicWalk'),
            },
            { wait: 0.1 },
            { command: 'Pose', ...switchTo(true)('Pose'), ...buildPayload('Pose') },
        ],
    };
    let DANSE_DU_SABBAT = [
        {
            command: 'ClassicWalk',
            ...switchTo(true)('ClassicWalk'),
            ...buildPayload('ClassicWalk'),
        },
        { command: 'Pose', ...switchTo(true)('Pose'), ...buildPayload('Pose') },
        { command: 'Euler', ...buildPayload('Euler') },
        { command: 'Backstand', ...switchTo(true)('Backstand'), ...buildPayload('Backstand') },
    ];

    let STRETCH_HELLO_JUMP = {
            sequence: [
                { command: 'Stretch', ...buildPayload('Stretch') },
                { command: 'Hello', ...buildPayload('Hello') },
                { wait: 0.3 },
                { command: 'FrontJump', ...buildPayload('FrontJump') },
                { wait: 1 },
                { command: 'FrontJump', ...buildPayload('FrontJump') },
                { wait: 0.1 },
                {
                    command: 'ClassicWalk',
                    ...switchTo(true)('ClassicWalk'),
                    ...buildPayload('ClassicWalk'),
                },
            ],
        }
    let actionSequence = [
        { command: 'Backstand', ...switchTo(true)('Backstand'), ...buildPayload('Backstand') },
        {
            command: 'ClassicWalk',
            ...switchTo(true)('ClassicWalk'),
            ...buildPayload('ClassicWalk'),
        },
        STRETCH_HELLO_JUMP,
        { command: 'Pose', ...switchTo(true)('Pose'), ...buildPayload('Pose') },
        { command: 'Handstand', ...switchTo(true)('Handstand'), ...buildPayload('Handstand') },
        {
            sequence: [
                {
                    command: 'ClassicWalk',
                    ...switchTo(true)('ClassicWalk'),
                    ...buildPayload('ClassicWalk'),
                },
                { wait: 1 },
                { command: 'FingerHeart', ...buildPayload('FingerHeart') },
            ],
        },

        { command: 'Sit', ...buildPayload('Sit') },
        { command: 'RiseSit', ...buildPayload('RiseSit') },
        { command: 'Jumping', ...switchTo(true)('Jumping'), ...buildPayload('Jumping') },
    ];

    let execute_step = (_actionSequence: any) => (i: number) => {
        console.log(_actionSequence[i]);
        websocket.send(_actionSequence[i]);
    };
    //create an object where each key is a button name and the value is a derived store for that button's state
    // let arrayOfButtonStores = R.mapObjIndexed(
    //     (value, key) => derived(buttonsStore, (state) => state[key]),
    //     get(gamepadStore).buttonsState,
    // );

    // //index commands by gamepad assignment for easy lookup of which command to trigger on button press
    // let gamepadMap: Record<string, any> = R.indexBy(R.prop('gamepad_assignment'), commands);

    // //subscribe to each button store and send a command upon button release
    // R.forEachObjIndexed(
    //     (command:Command, gamepad_assignment:string) => {
    //         arrayOfButtonStores[gamepad_assignment].subscribe((buttonState:NonEmptyArray<InputEvent<boolean>>) => {
    //             //Todo: also add a check to verify that the timestamp of false is higher than the timestamp of the last false button press plus the debounce time of the corresponding last command
    //             if (buttonState.length >= 2 && R.last(buttonState).value == false) {
    //                 websocket.send({
    //                     command: 'action',
    //                     api_id: command.api_id,
    //                     topic: command.topic,
    //                 });
    //             }
    //         });
    //     },gamepadMap
    // )

    let colors = ['🤍 white', '❤️ red', '💛 yellow', '💙 blue', '💚 green', '🩵 cyan', '💜 purple'];
    let movementMode = '';
    let speedLevel: 'Slow' | 'Normal' | 'Fast' = 'Normal';

    // Command that have no arguments (one-shot commands)
    const CMD_actions: Command[] = R.filter((x: Command) => x.args.length == 0 && x.working)(
        commands as Command[],
    );
    // const CMD_actions_piped: Command[] = R.compose(R.filter, R.complement, R.has('args'))(commands);
    const CMD_switches: Command[] = R.filter(
        (cmd: Command) => cmd.working && cmd.args!.length === 1 && cmd.args![0].type === 'boolean',
    )(commands as Command[]) as Command[];

    const CMD_switches_names: string[] = CMD_switches.map((command) => command.command_name);

    onMount(() => {
        websocket.connect();
    });

    async function connectRobot() {
        try {
            await websocket.send({ command: 'connect', ip: '192.168.123.161' });
            // Optionally, you can check for a successful connection response here
        } catch (error) {
            console.error('Connection failed:', error); // Handle any errors
        }
    }

    function disconnectRobot() {
        websocket.send({ command: 'disconnect' });
    }

    function handleModeSwitch(mode: string) {
        //Look up the command triggered by the radio change
        let cmd: Command | undefined = R.find((cmd) => cmd?.command_name == mode, CMD_switches);
        //we are interested in the api_id and the name of the arguments expected by the command

        if (cmd != undefined) {
            websocket.send({
                api_id: cmd.api_id,
                parameter: R.objOf(cmd.args[0]?.name, true),
                topic: cmd.topic,
            });
        }
    }

    function handleColorChange(event: RadioGridChangeEvent) {
        let colorName = event.detail.value as string;
        console.log(colorName);
        websocket.send({
            topic: 'VUI',
            api_id: 1007,
            parameter: {
                color: colorName.split(' ')[1],
                // time: 10,
            },
        });
    }
    function handleSpeedChange(event: RadioGridChangeEvent) {
        websocket.send(speedChangeMessage(event.detail.value as 'Slow' | 'Normal' | 'Fast'));
    }
</script>

<Video
    faceDetectionEnabled={FACE_DETECTION}
    faceLandmarksEnabled={FACE_LANDMARKS}
    agePredictionEnabled={AGE_PREDICTION}
/>
<GamepadController monitoring={false} />
<svelte:window
    on:keydown|preventDefault={(event) => {
        switch (event.key) {
            case 'ArrowRight':
                stepCounter = stepCounter >= actionSequence.length ? stepCounter : stepCounter + 1;
                execute_step(actionSequence)(stepCounter);
            // case 'ArrowLeft':
            //     stepCounter -= 1;
            //     execute_step(actionSequence)(stepCounter);
            // case 'ArrowUp':
            //     stepCounter += 1;
            // case 'ArrowDown':
            //     stepCounter -= 1;
            // case 'Enter':
            //     execute_step(actionSequence)(stepCounter);
        }
    }}
/>
<div class="ui-pane">
    <div>
        <Button
            on:click={() => {
                $robotConnected ? disconnectRobot() : connectRobot();
            }}
            disabled={!$webSocketConnected}
            title={$robotConnected ? 'Disconnect' : 'Connect'}
        />
        <Element>
            <div class="double-col" style="font-size:x-small">
                <p>Websocket: {$webSocketConnected ? '✅' : '❌'}</p>
                <p>Robot: {$robotConnected ? '✅' : '❌'}</p>
            </div>
        </Element>
        <Switch
            label={'Monitor State'}
            value={false}
            callback={(value: boolean) =>
                websocket.send({
                    command: 'subscribe',
                    switch: value,
                })}
        />
        <Switch
            value={true}
            label={'Obstacle Avoidance'}
            callback={(value: boolean) =>
                websocket.send({
                    topic: 'OBSTACLES_AVOID',
                    api_id: 1001,
                    parameter: { enable: value },
                })}
        />
        <Switch
            label={'Face Landmarks'}
            callback={(value: boolean) => {
                FACE_LANDMARKS = value;
            }}
        />
        <Switch
            label={'Face Detection'}
            callback={(value: boolean) => {
                FACE_DETECTION = value;
            }}
        />
        <Switch
            label={'Age Prediction'}
            callback={(value: boolean) => {
                AGE_PREDICTION = value;
            }}
        />
        <Switch
            label={'Gender Prediction'}
            callback={(value: boolean) => {
                GENDER_PREDICTION = value;
            }}
        />
    </div>
    <div>
        <Button on:click={() => websocket.send({ command: 'oz_overture' })} title="Oz Overture" />
        <Button
            on:click={() => websocket.send(STRETCH_HELLO_JUMP)}
            title="Stretch Hello"
        />
        <Button on:click={() => websocket.send({ command: 'joystick' })} title="Test Joystick" />
        <Button on:click={() => websocket.send(claquettes)} title="claquettes" />
    </div>
    <div class="button-grid">
        {#each CMD_actions as { api_id, working, command_name, topic }}
            {#if working}
                <Button
                    on:click={() =>
                        websocket.send({ api_id: api_id, command: command_name, topic: topic })}
                    title={command_name}
                />
            {/if}
        {/each}
    </div>
    <RadioGrid
        values={CMD_switches_names}
        value={movementMode}
        on:change={(e: RadioGridChangeEvent) => handleModeSwitch(e.detail.value as string)}
        label="Mode"
        columns={2}
    />
    <RadioGrid
        values={colors}
        value={'white'}
        on:change={handleColorChange}
        label="Light Color"
        columns={1}
    />

    <Pane position="inline">
        <RadioGrid
            values={['Slow', 'Normal', 'Fast']}
            value={speedLevel}
            on:change={handleSpeedChange}
            label="Speed Level"
            columns={3}
        />
    </Pane>
</div>

<style>
</style>
