<script lang="ts">
    import { entries, isIncludedIn, keys } from 'remeda';
    import { onMount } from 'svelte';
    import { websocket } from './lib/utils/webSocketClient';
    import { webSocketConnected, robotConnected, lidarOn, monitoringOn } from './lib/stores/connection';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import StatusStrip from './components/StatusStrip.svelte';
    import ControllerEmulation from './components/ControllerEmulation.svelte';
    // import Lidar from './components/Lidar.svelte';
    import { activeMode, cueLabel, enter, perform, set } from './lib/utils/commands';
    import { ACTIONS, MODES } from './lib/data/sportCommands';
    import { CONDUITE } from './lib/data/cues';
    import { COLOURS, SPEED_LEVELS } from './lib/data/settings';
    import { robotState } from './lib/stores/robotState';
    import { cueSheet } from './lib/stores/cueSheet';
    import { displayed } from './lib/utils/confirmable';

    /* STATE VARIABLES */

    /// Local display only: these two toggle what the video overlay draws and reach no robot.
    let FACE_DETECTION = false;
    let FACE_LANDMARKS = false;

    /// Every robot command leaves the browser through here, so every control the command
    /// affects shows the change and the robot's verdict on it.
    const sendToRobot = robotState.send;

    /// A top-level binding, so the markup can subscribe to it with `$reported`.
    const reported = robotState.reported;

    /// Top-level bindings, so the markup can subscribe to them with `$pointer`, `$pressed` and
    /// `$bindings`.
    const { pointer, pressed, bindings } = cueSheet;

    /// Whether the left sidebar holding the controller emulator is open. It starts closed.
    let drawerOpen = false;

    /// Releasing a key that fires a cue ends that cue's pressed drawing. The keyboard and the
    /// emulator both release through here.
    const release = (_key: string) => {
        if (isIncludedIn(_key, keys($bindings)) && $bindings[_key].kind === 'fire') cueSheet.release();
    };

    $: shown = displayed($robotState);

    onMount(() => {
        websocket.connect();
    });

    function connectRobot() {
        websocket.send({ command_name: 'connect', ip: '192.168.123.161' });
    }

    function disconnectRobot() {
        websocket.send({ command_name: 'disconnect' });
    }
</script>

<Video
    faceDetectionEnabled={FACE_DETECTION}
    faceLandmarksEnabled={FACE_LANDMARKS}
/>
<!-- <Lidar /> -->
<StatusStrip {drawerOpen} callback={(next) => (drawerOpen = next)} />
<aside class="drawer" class:open={drawerOpen}>
    <ControllerEmulation callback={(key, down) => (down ? cueSheet.press(key) : release(key))} />
</aside>
<svelte:window
    on:keyup={(event) => release(event.key)}
    on:keydown|preventDefault={(event) => {
        // A held key repeats its keydown; every binding acts once per press.
        if (!event.repeat) cueSheet.press(event.key);
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
            value={$lidarOn}
            disabled={!$robotConnected}
            callback={(next: boolean) => websocket.setLidar(next)}
        />
        <Switch
            label={'Monitor State'}
            value={$monitoringOn}
            disabled={!$robotConnected}
            callback={(next: boolean) => websocket.setMonitoring(next)}
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
                class:active-step={i === $pointer}
                class:pressed={i === $pressed}
                on:click={() => cueSheet.send(i)}
            >
                {cueLabel(action)}
            </button>
        {/each}
</div>

<style>
    /* Always in the grid; closed, it takes no width. The grid has no column gap, so the closed
       column takes no space, and the open drawer sets its own spacing. */
    .drawer {
        grid-area: drawer;
        width: 0;
        overflow: hidden;
        margin-inline-end: 0;
        transition: width 0.2s, margin-inline-end 0.2s;
    }

    .drawer.open {
        width: 12rem;
        overflow-y: auto;
        margin-inline-end: 1em;
    }

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
