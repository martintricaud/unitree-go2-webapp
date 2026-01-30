<script lang="ts">
    import * as R from 'ramda';
    import { onMount } from 'svelte';
    import { derived, get, writable } from 'svelte/store';
    import { RadioGrid, type RadioGridChangeEvent } from 'svelte-tweakpane-ui';
    import commands from '../../commands_1.1.7.json';
    import { websocket, webSocketConnected, robotConnected } from './lib/webSocketClient';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import GamepadController from './components/GamepadController.svelte';
    import { gamepadStore } from './lib/gamepadStore';
    import Lidar from './components/Lidar.svelte';
    import { actionSequence, buildPayload, switchTo } from './lib/commandUtilities';
    import type { Command } from './lib/commandUtilities';

    type InputEvent<T> = {
        index: number;
        value: T;
        timestamp: number;
    };

    type NonEmptyArray<T> = [T, ...T[]];
    type EventsArray<T> = InputEvent<T>[];

    /* STATE VARIABLES */

    let Pose_State: boolean = false;
    let Sit_State: boolean = false;
    let Leaping_State: boolean = false;
    let BINDINGS_PRESETS = 'Christine';
    let OBSTACLE_AVOIDANCE = true;
    let MONITOR_STATE = true;
    let FACE_DETECTION = false;
    let FACE_LANDMARKS = false;
    let GENDER_PREDICTION = false;
    let AGE_PREDICTION = false;
    let buttonsStore = derived(gamepadStore, ($gamepadStore) => $gamepadStore.buttonsState);
    let axisStore = derived(gamepadStore, ($gamepadStore) => $gamepadStore.axisState);

    let lightEmojiMap = R.zipObj(
        ['white', 'red', 'yellow', 'blue', 'green', 'cyan', 'purple'],
        ['🤍', '❤️', '💛', '💙', '💚', '🩵', '💜'],
    );
    let lightOptionsStore = writable({ options: R.keys(lightEmojiMap), currentOption: 'white' });
    let speedLevelOptions = [-1, 0, 1];
    let stepCounter = 0;

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

    let movementMode = '';

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
        } catch (error) {
            console.error('Connection failed:', error);
        }
    }

    function disconnectRobot() {
        websocket.send({ command: 'disconnect' });
    }

    function handleSpeedChange(speed: number) {
        websocket.send({
            command: 'SpeedLevel',
            parameter: { data: speed },
            ...buildPayload('SpeedLevel'),
        });
    }
    function handleModeChange(mode: string) {
        //Look up the command triggered by the radio button change
        let cmd: Command | undefined = R.find((cmd) => cmd?.command_name == mode, CMD_switches);
        if (cmd != undefined) {
            websocket.send({
                api_id: cmd.api_id,
                parameter: R.objOf(cmd.args[0]?.name, true),
                topic: cmd.topic,
            });
        }
    }

    function handleColorChange2(value: string) {
        console.log(value);
        websocket.send({
            topic: 'VUI',
            api_id: 1007,
            parameter: {
                color: value,
                // time: 10,
            },
        });
    }
    // function handleColorChange(event: RadioGridChangeEvent) {
    //     let colorName = event.detail.value as string;
    //     console.log(colorName);
    //     websocket.send({
    //         topic: 'VUI',
    //         api_id: 1007,
    //         parameter: {
    //             color: colorName.split(' ')[1],
    //             // time: 10,
    //         },
    //     });
    // }
</script>

<Video
    faceDetectionEnabled={FACE_DETECTION}
    faceLandmarksEnabled={FACE_LANDMARKS}
    agePredictionEnabled={AGE_PREDICTION}
/>
<!-- <Lidar /> -->
<GamepadController monitoring={false} />
<svelte:window
    on:keydown|preventDefault={(event) => {
        let L = actionSequence.length;
        switch (BINDINGS_PRESETS) {
            case 'Martin':
                switch (event.key) {
                    case 'ArrowRight':
                        execute_step(actionSequence)(stepCounter);
                        stepCounter = R.clamp(0, L)(stepCounter + 1);
                        break;
                    case 'ArrowLeft':
                        execute_step(actionSequence)(stepCounter);
                        stepCounter = R.clamp(0, L)(stepCounter - 1);
                        break;
                    case 'ArrowDown':
                        stepCounter = R.clamp(0, L)(stepCounter + 1);
                        break;
                    case 'ArrowUp':
                        stepCounter = R.clamp(0, L)(stepCounter - 1);
                        break;
                    case 'Enter':
                        execute_step(actionSequence)(stepCounter);
                        break;
                }
                break;
            case 'Christine':
                let exitPose = {
                    sequence: [
                        {command: 'Pose', ...switchTo(false)('Pose'),...buildPayload('Pose'),},
                        {command: 'FreeWalk', ...switchTo(true)('FreeWalk'),...buildPayload('FreeWalk'),}
                    ]
                }
                let exitSit = {
                    sequence: [
                        {command: 'RiseSit',...buildPayload('RiseSit'),},
                        {command: 'FreeWalk', ...switchTo(true)('FreeWalk'),...buildPayload('FreeWalk'),}
                    ]
                }
                switch (event.key) {
                    case 'b':
                        Leaping_State = !Leaping_State;
                        websocket.send({
                            command: 'Leaping',
                            ...switchTo(Leaping_State)('Leaping'),
                            ...buildPayload('Leaping'),
                        });
                        break;
                    case 'a':
                        Pose_State = !Pose_State;
                        Pose_State?websocket.send({command: 'Pose',...switchTo(Pose_State)('Pose'),...buildPayload('Pose'),
                        }):websocket.send(exitPose)
                        break;
                    case 'x':
                        Sit_State = !Sit_State
                        Sit_State? websocket.send({ command: 'Sit', ...buildPayload('Sit') }):websocket.send(exitSit)
                        break;
                    case 'y':
                         websocket.send({
                            command: 'Dance2',
                            ...buildPayload('Dance2'),
                        });
                        break;     
                }
                break;
        }
    }}
/>

<div class="ui-pane">
    <div style="display:flex; flex-wrap:nowrap; flex-direction: column; gap:.4em">
        <button
            disabled={!$webSocketConnected}
            on:click={() => {
                $robotConnected ? disconnectRobot() : connectRobot();
            }}
        >
            {$robotConnected ? 'Disconnect' : 'Connect'}
        </button>
        <div class="double-col">
            <p>Websocket: {$webSocketConnected ? '✅' : '❌'}</p>
            <p>Robot: {$robotConnected ? '✅' : '❌'}</p>
        </div>

        <Switch
            label={'Lidar'}
            value={false}
            callback={(value: boolean) => {
                websocket.send({
                    command: 'lidar',
                    switch: value,
                });
            }}
        />
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
    <div class="button-grid">
        {#each CMD_actions as { api_id, working, command_name, topic }}
            {#if working}
                <button
                    on:click={() =>
                        websocket.send({ api_id: api_id, command: command_name, topic: topic })}
                >
                    {command_name}
                </button>
            {/if}
        {/each}
    </div>
    <RadioGrid
        values={CMD_switches_names}
        value={movementMode}
        on:change={(e: RadioGridChangeEvent) => handleModeChange(e.detail.value as string)}
        label="Mode"
        columns={2}
    />
    <div style="display:flex; flex-wrap:nowrap; flex-direction: column;">
        {#each $lightOptionsStore.options as option}
            <Radio
                radioGroupData={lightOptionsStore}
                optionName={option}
                callback={handleColorChange2}
            />
        {/each}
    </div>
    <!-- <RadioGrid
        values={colors}
        value={'white'}
        on:change={handleColorChange}
        label="Light Color"
        columns={1}
    /> -->
    <div id="actionsequence">
        {#each actionSequence as action, i}
            <button
                class={`${i == stepCounter ? 'active-step' : ''}`}
                on:click={() => execute_step(actionSequence)(i)}
            >
                {action.command ?? action.displayName ?? undefined}
            </button>
        {/each}
    </div>
    <RadioGrid
        values={speedLevelOptions}
        value={0}
        on:change={(e: RadioGridChangeEvent) => handleSpeedChange(e.detail.value as number)}
        label="SpeedLevel"
        columns={1}
    />
</div>

<style>
    #actionsequence {
        display: flex;
        flex-direction: column;
        max-height: 100%;
        overflow-y: auto;
    }
    .active-step {
        border: 2px solid blue;
    }
</style>
