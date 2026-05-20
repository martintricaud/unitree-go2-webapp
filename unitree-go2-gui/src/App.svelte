<script lang="ts">
    import * as R from 'ramda';
    import { onMount } from 'svelte';
    import { derived, writable } from 'svelte/store';
    import { websocket, webSocketConnected, robotConnected } from './lib/webSocketClient';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import GamepadController from './components/GamepadController.svelte';
    import { gamepadStore } from './lib/gamepadStore';
    // import Lidar from './components/Lidar.svelte';
    import {
        CONDUITE,
        modeGroupData,
        presets,
        switchTo,
        buildPayload,
        CMD_actions,
        CMD_switches,
        CMD_switches_names,
        execute_step as executeStepFn,
    } from './lib/commandUtilities';
    import type { Command } from './lib/commandUtilities';

    type InputEvent<T> = {
        index: number;
        value: T;
        timestamp: number;
    };

    type NonEmptyArray<T> = [T, ...T[]];
    type EventsArray<T> = InputEvent<T>[];

    // let intervalId: any;
    /* STATE VARIABLES */

    let gamepadUser = writable({ currentOption: 'Martin', options: [] });
    let Pose_State: boolean = false;
    let Running_State: boolean = false;
    let Sit_State: boolean = false;
    let Redlight_State: boolean = false;
    let Whitelight_State: boolean = false;
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

    let hysteria: boolean = false;
    let lightEmojiMap = R.zipObj(
        ['white', 'red', 'yellow', 'blue', 'green', 'cyan', 'purple'],
        ['🤍', '❤️', '💛', '💙', '💚', '🩵', '💜'],
    );
    let lightOptionsStore = writable({ options: R.keys(lightEmojiMap), currentOption: 'white' });
    let speedOptionsStore = writable({
        options: ['slow', 'normal', 'fast'],
        currentOption: 'normal',
    });
    let speedValueMap: Record<string, number> = R.zipObj(['slow', 'normal', 'fast'], [-1, 0, 1]);

    let stepCounter = 0;

    let execute_step = executeStepFn(websocket);
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

    onMount(() => {
        websocket.connect();
    });

    async function connectRobot() {
        try {
            await websocket.send({ command_name: 'connect', ip: '192.168.123.161' });
        } catch (error) {
            console.error('Connection failed:', error);
        }
    }

    function disconnectRobot() {
        websocket.send({ command_name: 'disconnect' });
    }

    function handleSpeedChange(speed: string) {
        websocket.send({
            ...buildPayload('SpeedLevel'),
            parameter: { data: speedValueMap[speed] },
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

    function handleColorChange(value: string) {
        value == 'white'
            ? websocket.send({
                topic: 'VUI',
                api_id: 1005,
                parameter: { brightness: 1 },
            })
            : websocket.send({
                topic: 'VUI',
                api_id: 1007,
                parameter: { color: value },
            });
    }

    let keydownHandler = (event: KeyboardEvent) => {
        let L = CONDUITE.length;
        switch ($gamepadUser.currentOption) {
            case 'Martin':
                switch (event.key) {
                    case 'ArrowRight':
                        execute_step(CONDUITE)(stepCounter);
                        stepCounter = R.clamp(0, L)(stepCounter + 1);
                        if (stepCounter == CONDUITE.length) {
                            gamepadUser.update(R.assoc('currentOption', 'Christine'));
                        }
                        break;
                    case 'ArrowLeft':
                        execute_step(CONDUITE)(stepCounter);
                        stepCounter = R.clamp(0, L)(stepCounter - 1);
                        break;
                    case 'ArrowDown':
                        stepCounter = R.clamp(0, L)(stepCounter + 1);
                        break;
                    case 'ArrowUp':
                        stepCounter = R.clamp(0, L)(stepCounter - 1);
                        break;
                    case 'Enter':
                        execute_step(CONDUITE)(stepCounter);
                        break;
                }
                break;
            case 'Christine':
                switch (event.key) {
                    // case 'ArrowRight':
                    //     if ($modeGroupData.currentOption !== 'Pose') {
                    //         modeGroupData.update(R.assoc('currentOption', 'Pose'));
                    //         websocket.send(presets.enterPose);
                    //     }
                    //     intervalId = setInterval(() => {
                    //         websocket.send(presets.holdAim);
                    //         // Replace with your actual logic
                    //     }, 100);

                    //     break;
                    case 'ArrowLeft':
                        hysteria = !hysteria;
                        websocket.send(hysteria ? presets.stopAndCrouch : presets.stopAndStand);
                        break;
                    case 'ArrowUp':
                        websocket.send(presets.standContent);
                        break;
                    case 'ArrowDown':
                        Running_State = !Running_State;
                        if (Running_State) {
                            modeGroupData.update(R.assoc('currentOption', 'Trotting'));
                        }
                        websocket.send(
                            Running_State
                                ? switchTo(Running_State)('Trotting')
                                : switchTo(true)('FreeWalk'),
                        );
                        break;
                    case 'b':
                        Leaping_State = !Leaping_State;
                        websocket.send(switchTo(Leaping_State)('Leaping'));
                        break;
                    case 'a':
                        Pose_State = !Pose_State;
                        websocket.send(Pose_State ? presets.enterPose : presets.exitPose);
                        break;
                    case 'x':
                        Sit_State = !Sit_State;
                        websocket.send(Sit_State ? buildPayload('Sit') : presets.exitSit);
                        break;
                    case 'y':
                        websocket.send(presets.dance);
                        break;
                }
                break;
        }
    };
</script>

<Video
    faceDetectionEnabled={FACE_DETECTION}
    faceLandmarksEnabled={FACE_LANDMARKS}
/>
<!-- <Lidar /> -->
<GamepadController monitoring={false} />
<svelte:window
    on:keyup={(event) => {
        // switch ($gamepadUser.currentOption) {
        //     case 'Christine':
        //         if (event.key === 'ArrowRight') {
        //             clearInterval(intervalId);
        //             websocket.send(switchTo(false)('Pose'));
        //             modeGroupData.update(R.assoc('currentOption','FreeWalk'))
        //             websocket.send(switchTo(true)('FreeWalk'));
        //         }
        //         break;
        // }
    }}
    on:keydown|preventDefault={keydownHandler}
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
        <div>
            <Radio optionName={'Martin'} radioGroupData={gamepadUser} />
            <Radio optionName={'Christine'} radioGroupData={gamepadUser} />
        </div>
    </div>
    <div style="display:flex; flex-wrap:nowrap; flex-direction: column; gap:.4em">
        <button
            on:click={() => {
                websocket.send(presets.contentRed);
            }}
        >
            Content + Red
        </button>
        <!-- <button
            on:click={() => {
                websocket.send(presets.aimAtPublic);
            }}
        >
            Aim at public
        </button>

        <button
            on:click={() => {
                websocket.send(presets.stopAimAtPublic);
            }}
        >
            Stop aiming at public
        </button> -->
        <div class="double-col">
            <p>Websocket: {$webSocketConnected ? '✅' : '❌'}</p>
            <p>Robot: {$robotConnected ? '✅' : '❌'}</p>
        </div>

        <Switch
            label={'Lidar'}
            value={false}
            callback={(value: boolean) => {
                websocket.send({
                    command_name: 'lidar',
                    switch: value,
                });
            }}
        />
        <Switch
            label={'Monitor State'}
            value={false}
            callback={(value: boolean) =>
                websocket.send({
                    command_name: 'subscribe',
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
    </div>
    <div class="button-grid">
        {#each CMD_actions as { api_id, working, command_name, topic }}
            {#if working}
                <button
                    on:click={() =>
                        websocket.send({
                            api_id: api_id,
                            command_name: command_name,
                            topic: topic,
                        })}
                >
                    {command_name}
                </button>
            {/if}
        {/each}
    </div>
    <div class="button-grid">
        {#each CMD_switches_names as switchName}
            <Radio
                optionName={switchName}
                radioGroupData={modeGroupData}
                callback={handleModeChange}
            />
        {/each}
    </div>

    <div style="display:flex; flex-wrap:nowrap; flex-direction: column; gap:.4em">
        {#each $lightOptionsStore.options as option}
            <Radio
                radioGroupData={lightOptionsStore}
                optionName={option}
                callback={handleColorChange}
            />
        {/each}
    </div>
    <div id="actionsequence">
        {#each CONDUITE as action, i}
            <button
                class={`${i == stepCounter ? 'active-step' : ''}`}
                on:click={() => execute_step(CONDUITE)(i)}
            >
                {action.command_name ?? action.displayName ?? undefined}
            </button>
        {/each}
    </div>
    <div class="button-grid">
        {#each $speedOptionsStore.options as speedLevel}
            <Radio
                optionName={speedLevel}
                radioGroupData={speedOptionsStore}
                callback={handleSpeedChange}
            />
        {/each}
    </div>
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
