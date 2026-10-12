<script lang="ts">
    import { entries, keys } from 'remeda';
    import { onMount } from 'svelte';
    import { websocket } from './lib/utils/webSocketClient';
    import { webSocketConnected, robotConnected } from './lib/stores/connection';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import GamepadController from './components/GamepadController.svelte';
    import StatusStrip from './components/StatusStrip.svelte';
    // import Lidar from './components/Lidar.svelte';
    import { cueLabel, enter, leave, perform, set } from './lib/utils/commands';
    import { ACTIONS } from './lib/data/actions';
    import { CONDUITE, presets } from './lib/data/cues';
    import { MODES } from './lib/data/modes';
    import { LIGHT_EMOJIS, SPEED_LEVELS } from './lib/data/options';
    import type { RobotState } from './lib/data/robotState';
    import { cuePointer } from './lib/stores/cuePointer';
    import { robotState, send } from './lib/stores/robotState';
    import { displayed, fieldStatus } from './lib/utils/confirmable';
    import type { Confirmable } from './lib/utils/confirmable';

    // let intervalId: any;
    /* STATE VARIABLES */

    /// Who is driving. Each operator runs their own key bindings.
    const OPERATORS = ['Martin', 'Christine'];
    let operator = 'Martin';

    /// Local display only: these two toggle what the video overlay draws and reach no robot.
    let FACE_DETECTION = false;
    let FACE_LANDMARKS = false;

    /// Relay controls. The relay acts on these itself, through a publish that expects no reply
    /// or through a subscription, so there is no robot verdict to wait for and nothing to
    /// confirm. Each switch records what the relay was told.
    let lidarOn = false;
    let monitoringState = false;

    const LIGHT_OPTIONS = keys(LIGHT_EMOJIS);
    const SPEED_OPTIONS = entries(SPEED_LEVELS);

    /// Every robot command leaves the browser through here, so every control the command
    /// affects shows the change and the robot's verdict on it.
    const sendToRobot = send(websocket);

    /// Send the cue at this index of the cue sheet.
    const sendCue = (index: number) => void sendToRobot(CONDUITE[index]);

    $: shown = displayed($robotState);

    /// A confirmed value says nothing.
    const MARK = {
        pending: '…',
        confirmed: '',
        failed: '✗',
        rejected: '⊘',
        unknown: '?',
    };

    function markerOf(_state: Confirmable<RobotState>, _field: keyof RobotState) {
        const status = fieldStatus(_state, _field);
        return status === null ? '' : MARK[status];
    }

    /// In a radio group the marker belongs to the option the group is showing.
    function markerFor<K extends keyof RobotState>(
        _state: Confirmable<RobotState>,
        _field: K,
        _option: RobotState[K],
    ) {
        return displayed(_state)[_field] === _option ? markerOf(_state, _field) : '';
    }

    onMount(() => {
        websocket.connect();
    });

    function connectRobot() {
        websocket.send({ command_name: 'connect', ip: '192.168.123.161' });
    }

    function disconnectRobot() {
        websocket.send({ command_name: 'disconnect' });
    }

    const setLidar = (next: boolean) => {
        if (websocket.send({ command_name: 'lidar', switch: next })) lidarOn = next;
    };

    const setMonitoringState = (next: boolean) => {
        if (websocket.send({ command_name: 'subscribe', switch: next })) monitoringState = next;
    };

    /// The keys both operators share. Each asks for the opposite of what its control shows, so
    /// a refused command leaves the next press asking for the same thing again.
    const togglePose = () => {
        void sendToRobot(shown.mode !== 'Pose' ? presets.enterPose : presets.exitPose);
    };

    const toggleLeaping = () => {
        void sendToRobot(shown.mode !== 'Leaping' ? enter('Leaping') : leave('Leaping'));
    };

    const toggleSit = () => {
        void sendToRobot(shown.posture === 'sitting' ? presets.exitSit : perform('Sit'));
    };

    const dance = () => void sendToRobot(presets.dance);
    const standContent = () => void sendToRobot(presets.standContent);

    let keydownHandler = (event: KeyboardEvent) => {
        switch (operator) {
            case 'Martin':
                switch (event.key) {
                    case 'ArrowRight':
                        sendCue($cuePointer);
                        cuePointer.moveBy(1);
                        break;
                    case 'ArrowLeft':
                        sendCue($cuePointer);
                        cuePointer.moveBy(-1);
                        break;
                    case 'ArrowDown':
                        cuePointer.moveBy(1);
                        break;
                    case 'ArrowUp':
                        cuePointer.moveBy(-1);
                        break;
                    case 'Enter':
                        sendCue($cuePointer);
                        break;
                    case 'a':
                        togglePose();
                        break;
                    case 'b':
                        toggleLeaping();
                        break;
                    case 'x':
                        toggleSit();
                        break;
                    case 'y':
                        dance();
                        break;
                }
                break;
            case 'Christine':
                switch (event.key) {
                    // case 'ArrowRight':
                    //     if (shown.mode !== 'Pose') {
                    //         void sendToRobot(presets.enterPose);
                    //     }
                    //     intervalId = setInterval(() => {
                    //         void sendToRobot(presets.holdAim);
                    //         // Replace with your actual logic
                    //     }, 100);

                    //     break;
                    case 'ArrowLeft':
                        void sendToRobot(
                            shown.posture === 'lying' ? presets.stopAndStand : presets.stopAndCrouch,
                        );
                        break;
                    case 'ArrowUp':
                        standContent();
                        break;
                    case 'ArrowDown':
                        void sendToRobot(enter(shown.mode !== 'Trotting' ? 'Trotting' : 'FreeWalk'));
                        break;
                    case 'b':
                        toggleLeaping();
                        break;
                    case 'a':
                        togglePose();
                        break;
                    case 'x':
                        toggleSit();
                        break;
                    case 'y':
                        dance();
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
<StatusStrip />
<svelte:window
    on:keyup={(event) => {
        // switch (operator) {
        //     case 'Christine':
        //         if (event.key === 'ArrowRight') {
        //             clearInterval(intervalId);
        //             void sendToRobot(leave('Pose'));
        //             void sendToRobot(enter('FreeWalk'));
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
            {#each OPERATORS as name}
                <Radio
                    optionName={name}
                    selected={operator === name}
                    callback={() => (operator = name)}
                />
            {/each}
        </div>
    </div>
    <div style="display:flex; flex-wrap:nowrap; flex-direction: column; gap:.4em">
        <!-- <button
            on:click={() => {
                sendToRobot(presets.contentRed);
            }}
        >
            Content + Red
        </button> -->
        <div class="double-col">
            <p>Websocket: {$webSocketConnected ? '✅' : '❌'}</p>
            <p>Robot: {$robotConnected ? '✅' : '❌'}</p>
        </div>

        <Switch
            label={'Lidar'}
            value={lidarOn}
            disabled={!$robotConnected}
            callback={setLidar}
        />
        <Switch
            label={'Monitor State'}
            value={monitoringState}
            disabled={!$robotConnected}
            callback={setMonitoringState}
        />
        <Switch
            label={'Obstacle Avoidance'}
            value={shown.obstacleAvoidance}
            marker={markerOf($robotState, 'obstacleAvoidance')}
            disabled={!$robotConnected}
            callback={(next: boolean) => sendToRobot(set({ name: 'obstacleAvoidance', value: next }))}
        />
        <Switch
            label={'Face Landmarks'}
            value={FACE_LANDMARKS}
            callback={(next: boolean) => (FACE_LANDMARKS = next)}
        />
        <Switch
            label={'Face Detection'}
            value={FACE_DETECTION}
            callback={(next: boolean) => (FACE_DETECTION = next)}
        />
    </div>
    <div class="button-grid">
        {#each keys(ACTIONS) as action}
            <button disabled={!$robotConnected} on:click={() => sendToRobot(perform(action))}>
                {action}
            </button>
        {/each}
    </div>
    <div class="button-grid">
        {#each keys(MODES) as modeName}
            <Radio
                optionName={modeName}
                selected={shown.mode === modeName}
                marker={markerFor($robotState, 'mode', modeName)}
                disabled={!$robotConnected}
                callback={() => sendToRobot(enter(modeName))}
            />
        {/each}
    </div>

    <div class="button-grid">
        {#each LIGHT_OPTIONS as colour}
            <Radio
                optionName={colour}
                selected={shown.headlight === colour}
                marker={markerFor($robotState, 'headlight', colour)}
                disabled={!$robotConnected}
                callback={() => sendToRobot(set({ name: 'headlight', value: colour }))}
            />
        {/each}
    </div>
    <div id="actionsequence" style="width:max-content">

    </div>
    <div class="button-grid">
        {#each SPEED_OPTIONS as [speedName, level]}
            <Radio
                optionName={speedName}
                selected={shown.speed === level}
                marker={markerFor($robotState, 'speed', level)}
                disabled={!$robotConnected}
                callback={() => sendToRobot(set({ name: 'speed', value: level }))}
            />
        {/each}
    </div>
</div>
<div id="sidebar" class="actionsequence">
 {#each CONDUITE as action, i}
            <button
                class={`${i == $cuePointer ? 'active-step' : ''}`}
                on:click={() => sendCue(i)}
            >
                {cueLabel(action)}
            </button>
        {/each}
</div>

<style>
    .actionsequence {
        display: flex;
        flex-direction: column;
        max-height: 100%;
        overflow-y: auto;
    }
    .active-step {
        border: 2px solid blue;
    }
</style>
