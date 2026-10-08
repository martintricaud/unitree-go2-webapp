<script lang="ts">
    import * as R from 'ramda';
    import { onMount } from 'svelte';
    import { websocket, webSocketConnected, robotConnected } from './lib/webSocketClient';
    import Video from './components/Video.svelte';
    import Switch from './components/Switch.svelte';
    import Radio from './components/Radio.svelte';
    import GamepadController from './components/GamepadController.svelte';
    import StatusStrip from './components/StatusStrip.svelte';
    // import Lidar from './components/Lidar.svelte';
    import {
        CONDUITE,
        changeTo,
        cueLabel,
        cuePointer,
        dimTo,
        presets,
        switchTo,
        buildPayload,
        CMD_actions,
        CMD_switches_names,
        execute_step as executeStepFn,
    } from './lib/commandUtilities';
    import type { CueItem } from './lib/commandUtilities';
    import {
        crouched,
        headlight,
        mode,
        obstacleAvoidance,
        sitting,
        speed,
        speedValueMap,
    } from './lib/trackedState';
    import { displayed } from './lib/confirmable';
    import type { Confirmable, ConfirmableStore } from './lib/confirmable';
    import type { OutcomeName } from './lib/outcomes';

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

    let lightEmojiMap = R.zipObj(
        ['white', 'red', 'yellow', 'blue', 'green', 'cyan', 'purple'],
        ['🤍', '❤️', '💛', '💙', '💚', '🩵', '💜'],
    );
    const LIGHT_OPTIONS = R.keys(lightEmojiMap);
    const SPEED_OPTIONS = R.keys(speedValueMap);

    let execute_step = executeStepFn(websocket);

    /// Tells one proposal from the next, so a verdict answers only the proposal that produced
    /// it. It never leaves the browser: WebSocketClient mints the ids the relay sees.
    let lastProposal = 0;

    /// Show the operator's choice at once, send it, and let the robot's verdict settle it or
    /// take it back. Every control that represents robot state goes through here.
    async function attempt<T>(control: ConfirmableStore<T>, proposed: T, item: CueItem) {
        const reqId = (lastProposal += 1);
        control.propose(proposed, reqId);
        control.resolve(reqId, await websocket.request(item));
    }

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

    /// Obstacle avoidance has no entry in the command table, so its payload is written out
    /// here; `command_name` names it in the outcome log.
    const obstaclePayload = (enable: boolean): CueItem => ({
        kind: 'command',
        topic: 'OBSTACLES_AVOID',
        api_id: 1001,
        command_name: 'ObstaclesAvoid',
        parameter: { enable },
    });

    /// The white option is sent as a brightness rather than as a colour.
    const headlightPayload = (colour: string): CueItem =>
        colour === 'white' ? dimTo(1)('Brightness') : changeTo(colour)('Headlight');

    const handleSpeedChange = (level: string) =>
        attempt(speed, level, {
            ...buildPayload('SpeedLevel'),
            parameter: { data: speedValueMap[level] },
        });

    const handleModeChange = (name: string) => attempt(mode, name, switchTo(true)(name));

    const handleColorChange = (colour: string) =>
        attempt(headlight, colour, headlightPayload(colour));

    /// The keys both operators share. Each asks for the opposite of what its control shows, so
    /// a refused command leaves the next press asking for the same thing again.
    const togglePose = () => {
        const entering = displayed($mode) !== 'Pose';
        void attempt(
            mode,
            entering ? 'Pose' : 'FreeWalk',
            entering ? presets.enterPose : presets.exitPose,
        );
    };

    const toggleLeaping = () => {
        const entering = displayed($mode) !== 'Leaping';
        void attempt(mode, entering ? 'Leaping' : 'FreeWalk', switchTo(entering)('Leaping'));
    };

    const toggleSit = () => {
        const sittingDown = !displayed($sitting);
        void attempt(sitting, sittingDown, sittingDown ? buildPayload('Sit') : presets.exitSit);
    };

    /// Both cues end on FreeWalk, which is what they propose to the mode radio.
    const dance = () => void attempt(mode, 'FreeWalk', presets.dance);
    const standContent = () => void attempt(mode, 'FreeWalk', presets.standContent);

    let keydownHandler = (event: KeyboardEvent) => {
        switch (operator) {
            case 'Martin':
                switch (event.key) {
                    case 'ArrowRight':
                        execute_step(CONDUITE_SEQ)($cuePointer);
                        cuePointer.moveBy(1);
                        break;
                    case 'ArrowLeft':
                        execute_step(CONDUITE_SEQ)($cuePointer);
                        cuePointer.moveBy(-1);
                        break;
                    case 'ArrowDown':
                        cuePointer.moveBy(1);
                        break;
                    case 'ArrowUp':
                        cuePointer.moveBy(-1);
                        break;
                    case 'Enter':
                        execute_step(CONDUITE_SEQ)($cuePointer);
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
                    //         websocket.send(presets.enterPose);
                    //     }
                    //     intervalId = setInterval(() => {
                    //         websocket.send(presets.holdAim);
                    //         // Replace with your actual logic
                    //     }, 100);

                    //     break;
                    case 'ArrowLeft': {
                        const crouching = !displayed($crouched);
                        void attempt(
                            crouched,
                            crouching,
                            crouching ? presets.stopAndCrouch : presets.stopAndStand,
                        );
                        break;
                    }
                    case 'ArrowUp':
                        standContent();
                        break;
                    case 'ArrowDown': {
                        const running = displayed($mode) !== 'Trotting';
                        void attempt(
                            mode,
                            running ? 'Trotting' : 'FreeWalk',
                            switchTo(true)(running ? 'Trotting' : 'FreeWalk'),
                        );
                        break;
                    }
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
        //             websocket.send(switchTo(false)('Pose'));
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
                websocket.send(presets.contentRed);
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
            callback={(next: boolean) => attempt(obstacleAvoidance, next, obstaclePayload(next))}
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
        {#each CMD_actions as { api_id, working, command_name, topic }}
            {#if working}
                <button
                    disabled={!$robotConnected}
                    on:click={() =>
                        websocket.send({
                            kind: 'command',
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
                on:click={() => execute_step(CONDUITE_SEQ)(i)}
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
