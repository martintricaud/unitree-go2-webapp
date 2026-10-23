<script lang="ts">
    import { clamp, entries, keys } from 'remeda';
    import { onMount } from 'svelte';
    import { writable } from 'svelte/store';
    import { websocket } from './lib/utils/webSocketClient';
    import { webSocketConnected, robotConnected } from './lib/stores/connection';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import StatusStrip from './components/StatusStrip.svelte';
    // import Lidar from './components/Lidar.svelte';
    import { activeMode, cueLabel, enter, isEnterable, leavePosture, perform, set, switchTo } from './lib/utils/commands';
    import type { RobotState } from './lib/utils/commands';
    import { ACTIONS, MODES } from './lib/data/sportCommands';
    import { CONDUITE, presets } from './lib/data/cues';
    import { COLOURS, SPEED_LEVELS } from './lib/data/settings';
    import { reported, robotState, send } from './lib/stores/robotState';
    import { displayed } from './lib/utils/confirmable';

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

    /// Every robot command leaves the browser through here, so every control the command
    /// affects shows the change and the robot's verdict on it.
    const sendToRobot = send(websocket);

    /// Send the cue at this index of the cue sheet.
    const sendCue = (index: number) => void sendToRobot(CONDUITE[index]);

    $: shown = displayed($robotState);

    /// Where the operator stands in the cue sheet.
    const cuePointer = writable(0);

    function moveCuePointer(_steps: number) {
        cuePointer.update(function (_at) {
            return clamp(_at + _steps, { min: 0, max: CONDUITE.length - 1 });
        });
    }

    /// The cue a held key is executing, drawn pressed until the key is released.
    let pressedCue: number | null = null;

    function executeCue(_steps: number) {
        pressedCue = $cuePointer;
        sendCue($cuePointer);
        moveCuePointer(_steps);
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

    /// Whether any of these fields is waiting for the robot's verdict.
    const isWaiting = (..._fields: (keyof RobotState)[]) =>
        _fields.some((_field) => $robotState.pending[_field] !== undefined);

    /// The toggle keys. Each asks for the opposite of what its control shows, so a refused command
    /// leaves the next press asking for the same thing again. A press while the toggled fields wait
    /// for a verdict is ignored: it would read the pending value and queue the opposite command.
    const togglePose = () => {
        if (isWaiting('posture')) return;
        void sendToRobot(shown.posture === 'Pose' ? leavePosture('Pose') : switchTo('Pose')(shown));
    };

    /// Leaping toggles back to the gait the robot had before it. A gait the robot only reports has
    /// no command, so leaving Leaping then lets the robot pick its gait.
    const toggleLeaping = () => {
        if (isWaiting('gait', 'posture')) return;
        const { previousGait } = shown;
        if (shown.gait !== 'Leaping' || shown.posture !== null) {
            void sendToRobot(switchTo('Leaping')(shown));
            return;
        }
        void sendToRobot(switchTo(isEnterable(previousGait) ? previousGait : 'FreeWalk')(shown));
    };

    const toggleSit = () => {
        if (isWaiting('posture')) return;
        void sendToRobot(shown.posture === 'Sitting' ? leavePosture('Sitting') : switchTo('Sitting')(shown));
    };

    const toggleCrouch = () => {
        if (isWaiting('posture')) return;
        void sendToRobot(shown.posture === 'Lying' ? presets.stopAndStand : presets.stopAndCrouch);
    };

    const toggleTrotting = () => {
        if (isWaiting('gait', 'posture')) return;
        void sendToRobot(enter(shown.gait !== 'Trotting' ? 'Trotting' : 'FreeWalk'));
    };

    const dance = () => void sendToRobot(presets.dance);
    const standContent = () => void sendToRobot(presets.standContent);

    let keydownHandler = (event: KeyboardEvent) => {
        // A held key repeats its keydown; every binding acts once per press.
        if (event.repeat) return;
        switch (operator) {
            case 'Martin':
                switch (event.key) {
                    case 'ArrowRight':
                        executeCue(1);
                        break;
                    case 'ArrowLeft':
                        executeCue(-1);
                        break;
                    case 'ArrowDown':
                        moveCuePointer(1);
                        break;
                    case 'ArrowUp':
                        moveCuePointer(-1);
                        break;
                    case 'Enter':
                        executeCue(0);
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
                    //     if (shown.posture !== 'Pose') {
                    //         void sendToRobot(presets.enterPose);
                    //     }
                    //     intervalId = setInterval(() => {
                    //         void sendToRobot(presets.holdAim);
                    //         // Replace with your actual logic
                    //     }, 100);

                    //     break;
                    case 'ArrowLeft':
                        toggleCrouch();
                        break;
                    case 'ArrowUp':
                        standContent();
                        break;
                    case 'ArrowDown':
                        toggleTrotting();
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
<StatusStrip />
<svelte:window
    on:keyup={(event) => {
        if (['ArrowRight', 'ArrowLeft', 'Enter'].includes(event.key)) pressedCue = null;
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
            confirmed={$robotState.settled.obstacleAvoidance}
            spinning={$robotState.pending.obstacleAvoidance !== undefined}
            disabled={!$robotConnected || !$reported.obstacleAvoidance}
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
                selected={activeMode($robotState.settled) === modeName}
                spinning={activeMode(shown) === modeName && activeMode(shown) !== activeMode($robotState.settled)}
                disabled={!$robotConnected || !($reported.gait || $reported.posture)}
                callback={() => sendToRobot(enter(modeName))}
            />
        {/each}
    </div>

    <div class="button-grid">
        {#each COLOURS as colour}
            <Radio
                optionName={colour}
                selected={$robotState.settled.headlight === colour}
                spinning={$robotState.pending.headlight?.value === colour}
                disabled={!$robotConnected}
                callback={() => sendToRobot(set({ name: 'headlight', value: colour }))}
            />
        {/each}
    </div>
    <div id="actionsequence" style="width:max-content">

    </div>
    <div class="button-grid">
        {#each entries(SPEED_LEVELS) as [speedName, level]}
            <Radio
                optionName={speedName}
                selected={$robotState.settled.speed === level}
                spinning={$robotState.pending.speed?.value === level}
                disabled={!$robotConnected || !$reported.speed}
                callback={() => sendToRobot(set({ name: 'speed', value: level }))}
            />
        {/each}
    </div>
</div>
<div id="sidebar" class="actionsequence">
 {#each CONDUITE as action, i}
            <button
                class:active-step={i === $cuePointer}
                class:pressed={i === pressedCue}
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
        /* outline: 2px solid blue; */
        font-weight: bold;
        box-shadow: inset 0 0 10px rgb(0, 218, 163);
        border-color: rgb(0, 218, 163);
    }
    .actionsequence button:active,
    .pressed {
        border-style: inset;
    }
</style>
