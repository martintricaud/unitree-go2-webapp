<script lang="ts">
    import { entries, keys } from 'remeda';
    import { onMount } from 'svelte';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import StatusStrip from './components/StatusStrip.svelte';
    import CueStrip from './components/CueStrip.svelte';
    import ControllerEmulation from './components/ControllerEmulation.svelte';
    // import Lidar from './components/Lidar.svelte';
    import {
        ACTIONS,
        GAITS,
        POSTURES,
        activeMode,
        enter,
        isCommandable,
        perform,
        recover,
        set,
    } from './lib/utils/commands';
    import type { Cue } from './lib/utils/commands';
    import { COLOURS, SPEED_LEVELS } from './lib/data/settings';
    import { robot } from './lib/stores/robot';
    import { cueSheet } from './lib/stores/cueSheet';
    import { displayed } from './lib/utils/confirmable';

    /* STATE VARIABLES */

    /// Local display only: these two toggle what the video overlay draws and reach no robot.
    let FACE_DETECTION = false;
    let FACE_LANDMARKS = false;

    /// Every robot command leaves the browser through here, so every control the command
    /// affects shows the change and the robot's verdict on it.
    const sendToRobot = (_cue: Cue) => void robot.request(_cue);

    /// Whether the left sidebar holding the controller emulator is open. It starts closed.
    let drawerOpen = false;

    $: shown = displayed($robot.state);

    onMount(() => {
        robot.connect();
    });
</script>

<Video
    faceDetectionEnabled={FACE_DETECTION}
    faceLandmarksEnabled={FACE_LANDMARKS}
/>
<!-- <Lidar /> -->
<StatusStrip {drawerOpen} callback={(next) => (drawerOpen = next)} />
<aside class="drawer" class:open={drawerOpen}>
    <ControllerEmulation callback={(key, down) => (down ? cueSheet.press(key) : cueSheet.release(key))} />
</aside>
<svelte:window
    on:keyup={(event) => cueSheet.release(event.key)}
    on:keydown={(event) => {
        // A cancelled Escape keydown would stop Escape from closing the log popover.
        if (event.key !== 'Escape') event.preventDefault();
        // A held key repeats its keydown; every binding acts once per press.
        if (!event.repeat) cueSheet.press(event.key);
    }}
/>

<div class="ui-pane">
    <div style="display:flex; flex-wrap:nowrap; flex-direction: column; gap:.4em">
        <!-- <button
            on:click={() => {
                sendToRobot(presets.contentRed);
            }}
        >
            Content + Red
        </button> -->
        <Switch
            label={'Lidar'}
            value={$robot.lidarOn}
            disabled={!$robot.robotConnected}
            callback={(next: boolean) => robot.setLidar(next)}
        />
        <Switch
            label={'Monitor State'}
            value={$robot.monitoringOn}
            disabled={!$robot.robotConnected}
            callback={(next: boolean) => robot.setMonitoring(next)}
        />
        <Switch
            label={'Obstacle Avoidance'}
            value={shown.obstacleAvoidance}
            confirmed={$robot.state.settled.obstacleAvoidance}
            spinning={$robot.state.pending.obstacleAvoidance !== undefined}
            disabled={!$robot.robotConnected || !$robot.reported.obstacleAvoidance}
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
        {#each ACTIONS as action}
            <button disabled={!$robot.robotConnected} on:click={() => sendToRobot(perform(action))}>
                {action}
            </button>
        {/each}
        <button disabled={!$robot.robotConnected} on:click={() => sendToRobot(recover())}>RecoveryStand</button>
    </div>
    <div class="button-grid">
        {#each [...keys(GAITS).filter(isCommandable), ...keys(POSTURES)] as target}
            <Radio
                optionName={target}
                selected={activeMode($robot.state.settled) === target}
                spinning={activeMode(shown) === target && activeMode(shown) !== activeMode($robot.state.settled)}
                disabled={!$robot.robotConnected || !($robot.reported.gait || $robot.reported.posture)}
                callback={() => sendToRobot(enter(target))}
            />
        {/each}
    </div>

    <div class="button-grid">
        {#each COLOURS as colour}
            <Radio
                optionName={colour}
                selected={$robot.state.settled.headlight === colour}
                spinning={$robot.state.pending.headlight?.value === colour}
                disabled={!$robot.robotConnected}
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
                selected={$robot.state.settled.speed === level}
                spinning={$robot.state.pending.speed?.value === level}
                disabled={!$robot.robotConnected || !$robot.reported.speed}
                callback={() => sendToRobot(set({ name: 'speed', value: level }))}
            />
        {/each}
    </div>
</div>
<CueStrip />

<style>
    /* Floats over the top-left of the page. A fixed element shrinks to its content, and the
       emulator takes its width from the drawer, so min-width gives the drawer its width.
       Closed, it slides out to the left and is hidden once the slide ends. */
    .drawer {
        position: fixed;
        top: 0;
        left: 0;
        min-width: 12rem;
        padding: 1em;
        background: transparent;
        transform: translateX(-100%);
        visibility: hidden;
        transition: transform 0.2s, visibility 0.2s;
        /* The transparent padding must not block clicks on the page under it. */
        pointer-events: none;
    }

    .drawer > :global(*) {
        pointer-events: auto;
    }

    .drawer.open {
        transform: none;
        visibility: visible;
    }
</style>
