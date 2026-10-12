<script lang="ts">
    import { keys } from 'remeda';
    import { onMount } from 'svelte';
    import { websocket } from './lib/utils/webSocketClient';
    import { webSocketConnected, robotConnected } from './lib/stores/connection';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import GamepadController from './components/GamepadController.svelte';
    import StatusStrip from './components/StatusStrip.svelte';
    // import Lidar from './components/Lidar.svelte';
    import {
        changeTo,
        cueLabel,
        dimTo,
        switchTo,
        toggleTo,
        buildPayload,
        CMD_actions,
        CMD_switches,
    } from './lib/utils/payloads';
    import type { SwitchName } from './lib/data/commands';
    import { CONDUITE, presets } from './lib/data/cues';
    import { LIGHT_EMOJIS, SPEED_LEVELS } from './lib/data/options';
    import type { Colour, Speed } from './lib/data/options';
    import { cuePointer } from './lib/stores/cuePointer';
    import {
        crouched,
        headlight,
        mode,
        obstacleAvoidance,
        send,
        sitting,
        speed,
    } from './lib/stores/robotState';
    import { displayed } from './lib/utils/confirmable';
    import type { Confirmable } from './lib/utils/confirmable';
    import type { OutcomeName } from './lib/stores/outcomes';

    const CONDUITE_SEQ = CONDUITE.sequence;

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
    const SPEED_OPTIONS = keys(SPEED_LEVELS);

    /// Every robot command leaves the browser through here, so every control the command
    /// affects shows the change and the robot's verdict on it.
    const sendToRobot = send(websocket);

    /// Send the cue at this index of the cue sheet.
    const sendCue = (index: number) => void sendToRobot(CONDUITE_SEQ[index]);

    /// What a control says about its own value: waiting for the robot, or the verdict on the
    /// last thing it asked for. A confirmed value says nothing.
    const MARK: Record<OutcomeName, string> = {
        confirmed: '',
        failed: '✗',
        rejected: '⊘',
        unknown: '?',
    };

    function markerOf(state: Confirmable<unknown>): string {
        if (state.pending !== null) return '…';
        if (state.lastOutcome === null) return '';
        return MARK[state.lastOutcome.outcome];
    }

    /// In a radio group the marker belongs to the option the group is showing; the others
    /// carry none.
    const markerFor = (state: Confirmable<string | null>, option: string): string =>
        displayed(state) === option ? markerOf(state) : '';

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

    const handleSpeedChange = (level: Speed) =>
        sendToRobot({
            ...buildPayload('SpeedLevel'),
            parameter: { data: SPEED_LEVELS[level] },
        });

    const handleModeChange = (name: SwitchName) => sendToRobot(switchTo(true)(name));

    /// The white option is sent as a brightness rather than as a colour. Brightness implies no
    /// headlight colour, so white is passed explicitly.
    const handleColorChange = (colour: Colour) =>
        colour === 'white'
            ? sendToRobot(dimTo(1)('Brightness'), { headlight: 'white' })
            : sendToRobot(changeTo(colour)('Headlight'));

    /// The keys both operators share. Each asks for the opposite of what its control shows, so
    /// a refused command leaves the next press asking for the same thing again.
    const togglePose = () => {
        void sendToRobot(displayed($mode) !== 'Pose' ? presets.enterPose : presets.exitPose);
    };

    const toggleLeaping = () => {
        void sendToRobot(switchTo(displayed($mode) !== 'Leaping')('Leaping'));
    };

    const toggleSit = () => {
        void sendToRobot(displayed($sitting) ? presets.exitSit : buildPayload('Sit'));
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
                    //     if (displayed($mode) !== 'Pose') {
                    //         void sendToRobot(presets.enterPose);
                    //     }
                    //     intervalId = setInterval(() => {
                    //         void sendToRobot(presets.holdAim);
                    //         // Replace with your actual logic
                    //     }, 100);

                    //     break;
                    case 'ArrowLeft':
                        void sendToRobot(
                            displayed($crouched) ? presets.stopAndStand : presets.stopAndCrouch,
                        );
                        break;
                    case 'ArrowUp':
                        standContent();
                        break;
                    case 'ArrowDown':
                        void sendToRobot(
                            switchTo(true)(displayed($mode) !== 'Trotting' ? 'Trotting' : 'FreeWalk'),
                        );
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
        //             void sendToRobot(switchTo(false)('Pose'));
        //             void sendToRobot(switchTo(true)('FreeWalk'));
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
            value={displayed($obstacleAvoidance)}
            marker={markerOf($obstacleAvoidance)}
            disabled={!$robotConnected}
            callback={(next: boolean) => sendToRobot(toggleTo(next)('ObstaclesAvoid'))}
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
        {#each CMD_actions as { working, command_name }}
            {#if working}
                <button
                    disabled={!$robotConnected}
                    on:click={() => sendToRobot(buildPayload(command_name))}
                >
                    {command_name}
                </button>
            {/if}
        {/each}
    </div>
    <div class="button-grid">
        {#each CMD_switches as { command_name: switchName }}
            <Radio
                optionName={switchName}
                selected={displayed($mode) === switchName}
                marker={markerFor($mode, switchName)}
                disabled={!$robotConnected}
                callback={() => handleModeChange(switchName)}
            />
        {/each}
    </div>

    <div class="button-grid">
        {#each LIGHT_OPTIONS as colour}
            <Radio
                optionName={colour}
                selected={displayed($headlight) === colour}
                marker={markerFor($headlight, colour)}
                disabled={!$robotConnected}
                callback={() => handleColorChange(colour)}
            />
        {/each}
    </div>
    <div id="actionsequence" style="width:max-content">

    </div>
    <div class="button-grid">
        {#each SPEED_OPTIONS as speedLevel}
            <Radio
                optionName={speedLevel}
                selected={displayed($speed) === speedLevel}
                marker={markerFor($speed, speedLevel)}
                disabled={!$robotConnected}
                callback={() => handleSpeedChange(speedLevel)}
            />
        {/each}
    </div>
</div>
<div id="sidebar" class="actionsequence">
 {#each CONDUITE_SEQ as action, i}
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
