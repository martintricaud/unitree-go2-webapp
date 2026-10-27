<script lang="ts">
    import { entries } from 'remeda';
    import { onMount } from 'svelte';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import StatusStrip from './components/StatusStrip.svelte';
    import CueStrip from './components/CueStrip.svelte';
    import ControllerEmulation from './components/ControllerEmulation.svelte';
    // import Lidar from './components/Lidar.svelte';
    import { POSTURE_FACES, enter, leave, set, transition } from './lib/utils/commands';
    import type { Cell, Cue } from './lib/utils/commands';
    import { SPEED_LEVELS } from './lib/data/settings';
    import { robot } from './lib/stores/robot.svelte';
    import { cueSheet } from './lib/stores/cueSheet.svelte';
    import { displayed } from './lib/utils/confirmable';

    /* STATE VARIABLES */

    /// Local display only: these two toggle what the video overlay draws and reach no robot.
    let FACE_DETECTION = $state(false);
    let FACE_LANDMARKS = $state(false);

    /// Every robot command leaves the browser through here, so every control the command
    /// affects shows the change and the robot's verdict on it.
    const sendToRobot = (_cue: Cue) => void robot.request(_cue);

    /// Whether the left sidebar holding the controller emulator is open. It starts closed.
    let drawerOpen = $state(false);

    let shown = $derived(displayed(robot.current.state));
    /// The state the robot would settle in from its settled state once `_cell` has run: a pane
    /// button is ticked when its cell would change nothing.
    const after = (_cell: Cell) => transition(_cell)(robot.current.state.settled);

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
    onkeyup={(event) => cueSheet.release(event.key)}
    onkeydown={(event) => {
        // A cancelled Escape keydown would stop Escape from closing the log popover.
        if (event.key !== 'Escape') event.preventDefault();
        // A held key repeats its keydown; every binding acts once per press.
        if (!event.repeat) cueSheet.press(event.key);
    }}
/>

<div class="ui-pane">
    <div style="display:flex; flex-wrap:nowrap; flex-direction: column; gap:.4em">
        <!-- <button
            onclick={() => {
                sendToRobot(presets.contentRed);
            }}
        >
            Content + Red
        </button> -->
        <Switch
            label={'Lidar'}
            value={robot.current.lidarOn}
            disabled={!robot.current.robotConnected}
            callback={(next: boolean) => robot.setLidar(next)}
        />
        <Switch
            label={'Monitor State'}
            value={robot.current.monitoringOn}
            disabled={!robot.current.robotConnected}
            callback={(next: boolean) => robot.setMonitoring(next)}
        />
        <Switch
            label={'Obstacle Avoidance'}
            value={shown.obstacleAvoidance}
            confirmed={robot.current.state.settled.obstacleAvoidance}
            spinning={robot.current.state.pending.obstacleAvoidance !== undefined}
            disabled={!robot.current.robotConnected || !robot.current.reported.obstacleAvoidance}
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
    <section>
        <h2>Actions</h2>
        <div class="button-grid">
            {#each cueSheet.state.shown.pane.actions as cell (cell.id)}
                <button class:swept={cueSheet.isTarget(cell)} class:pressed={cueSheet.isPressed(cell)} class:greyed={!cueSheet.usable(cell)}
                    aria-disabled={!cueSheet.usable(cell)} onclick={() => cueSheet.use(cell)}>
                    {cell.label}
                </button>
            {/each}
        </div>
    </section>
    <!-- The gait stays ticked during a posture, as the gait the robot returns to when it leaves it. -->
    <section>
        <h2>Gaits</h2>
        <div class="button-grid">
            {#each cueSheet.state.shown.pane.gaits as cell (cell.id)}
                <div class="target" class:swept={cueSheet.isTarget(cell)} class:pressed={cueSheet.isPressed(cell)}><Radio
                    optionName={cell.label}
                    selected={robot.current.state.settled.gait === after(cell).gait}
                    spinning={robot.current.state.pending.gait?.value === after(cell).gait}
                    greyed={!cueSheet.usable(cell)}
                    callback={() => cueSheet.use(cell)}
                /></div>
            {/each}
        </div>
    </section>
    <!-- Each posture is one pair: the left side enters it, the right side leaves it. Only the side
         the robot's settled posture allows is usable, and a key draws only that side pressed. -->
    <section>
        <h2>Posture changes</h2>
        <div class="button-grid pairs">
            {#each cueSheet.state.shown.pane.postures as cell (cell.id)}
                {@const posture = after(cell).posture}
                {#if posture}
                    {@const entry = enter(posture)}
                    {@const exit = leave(posture)}
                    {@const inPosture = robot.current.state.settled.posture === posture}
                    {@const pending = robot.current.state.pending.posture}
                    <div class="posture-toggle" class:swept={cueSheet.isTarget(cell)}>
                        <button class:pressed={cueSheet.isPressed(cell, entry)} class:greyed={!cueSheet.usable(cell, entry)}
                            aria-disabled={!cueSheet.usable(cell, entry)} onclick={() => cueSheet.use(cell, entry)}>
                            {POSTURE_FACES[posture][0]}
                            {#if pending?.value === posture}<span class="spinner" aria-label="waiting for the robot"></span>{/if}
                        </button>
                        <button class:pressed={cueSheet.isPressed(cell, exit)} class:greyed={!cueSheet.usable(cell, exit)}
                            aria-disabled={!cueSheet.usable(cell, exit)} onclick={() => cueSheet.use(cell, exit)}>
                            {POSTURE_FACES[posture][1]}
                            {#if inPosture && pending?.value === null}<span class="spinner" aria-label="waiting for the robot"></span>{/if}
                        </button>
                    </div>
                {/if}
            {/each}
        </div>
    </section>
    <section>
        <h2>Light</h2>
        <div class="button-grid single-column">
            {#each cueSheet.state.shown.pane.lights as cell (cell.id)}
                <div class="target" class:swept={cueSheet.isTarget(cell)} class:pressed={cueSheet.isPressed(cell)}><Radio
                    optionName={cell.label}
                    selected={robot.current.state.settled.headlight === after(cell).headlight}
                    spinning={robot.current.state.pending.headlight?.value === after(cell).headlight}
                    greyed={!cueSheet.usable(cell)}
                    callback={() => cueSheet.use(cell)}
                /></div>
            {/each}
        </div>
    </section>
    <section>
        <h2>Speed</h2>
        <div class="button-grid">
            {#each entries(SPEED_LEVELS) as [speedName, level]}
                <Radio
                    optionName={speedName}
                    selected={robot.current.state.settled.speed === level}
                    spinning={robot.current.state.pending.speed?.value === level}
                    disabled={!robot.current.robotConnected || !robot.current.reported.speed}
                    callback={() => sendToRobot(set({ name: 'speed', value: level }))}
                />
            {/each}
        </div>
    </section>
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

    /* Wraps a Radio so that the highlight reaches its button; the wrapper takes no box of its own. */
    .target {
        display: contents;
    }

    .drawer.open {
        transform: none;
        visibility: visible;
    }
</style>
