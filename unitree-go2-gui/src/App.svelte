<script lang="ts">
    import { onMount } from 'svelte';
    import {
        Checkbox,
        Element,
        ThemeUtils,
        RadioGrid,
        Button,
        Pane,
        RotationEuler,
        type RotationEulerValueObject,
        type CheckboxChangeEvent,
        type RadioGridChangeEvent,
        type PointValue2d,
        type PointChangeEvent,
        type RotationEulerChangeEvent,
        List,
    } from 'svelte-tweakpane-ui';
    import commands from '../../commands.json';
    import { websocket, webSocketConnected, robotConnected } from './lib/webSocketClient';
    import { speedChangeMessage, gaitChangeMessage } from './lib/messageGenerators';
    import Video from './components/Video.svelte';

    ThemeUtils.setGlobalDefaultTheme(ThemeUtils.presets.retro);
    type Mode = 'AI' | 'SPORT';

    type CommandArg = {
        name: string;
        type: string;
    };

    type Command = {
        api_id: string;
        description?: string;
        args?: CommandArg[];
        mode_compatibility?: Record<string, boolean>;
    };

    let mode: Mode = 'SPORT';
    let speedLevel: 'Slow' | 'Normal' | 'Fast' = 'Normal';
    let gait: 'Idle' | 'Trot' | 'Running' | 'Forward Climb' | 'Reverse Climb' = 'Trot';

    // Command that have no arguments (one-shot commands)
    const commands_oneshot = commands.filter((cmd) => !cmd.args);
    // Commands that toggle between states of the robot
    const commands_switches: Command[] = commands.filter((cmd) => cmd.args?.[0].type === 'boolean');

    let eulerAngles: RotationEulerValueObject = {
        x: 0,
        y: 0,
        z: 0,
    };

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

    function handleModeChange(event: RadioGridChangeEvent) {
        mode = event.detail.value as Mode;
        websocket.send({ api_id: '', command: 'set_mode', parameter: { name: mode } });
    }

    function sendEuler(event: RotationEulerChangeEvent) {
        // let _x: number = event.detail.value.x;
        // let _y: number = event.detail.value.y;
        // let _z: number = event.detail.value.z;
        // websocket.send({ command: 'set_orientation', _x, _y, _z });
    }

    function handleSpeedChange(event: RadioGridChangeEvent) {
        websocket.send(speedChangeMessage(event.detail.value as 'Slow' | 'Normal' | 'Fast'));
    }

    function handleGaitChange(event: RadioGridChangeEvent) {
        websocket.send(
            gaitChangeMessage(
                event.detail.value as
                    | 'Idle'
                    | 'Trot'
                    | 'Running'
                    | 'Forward Climb'
                    | 'Reverse Climb',
            ),
        );
    }
</script>

<div class="parent">
    <div class="div1">
        <Button
            on:click={() => {
                $robotConnected ? disconnectRobot() : connectRobot();
            }}
            disabled={!$webSocketConnected || $robotConnected}
            title={$robotConnected ? 'Disconnect' : 'Connect'}
        />
        <Element>
            <div style="font-size:x-small">
                <p>Websocket: {$webSocketConnected ? '✅' : '❌'}</p>
                <p>Robot: {$robotConnected ? '✅' : '❌'}</p>
            </div>
        </Element>
        <Button on:click={() => websocket.send({ command: 'subscribe' })} title="Monitor State" />
        <RadioGrid
            values={['SPORT', 'AI']}
            value={mode}
            on:change={handleModeChange}
            label="Mode"
            columns={2}
        />
        <Pane position="inline" title="Commands">
            {#each commands_oneshot as { api_id, working }}
                {#if working}
                    <Button
                        on:click={() => websocket.send({ api_id: api_id, command: api_id })}
                        title={api_id}
                    />
                {/if}
            {/each}
        </Pane>
        <Pane position="inline" title="Movement Modes">
            {#each commands_switches as cmd}
                <Checkbox
                    label={cmd.api_id}
                    value={false}
                    on:change={(e) => {
                        console.log(e);
                        console.log(cmd.args?.[0]);
                        websocket.send({
                            api_id: cmd.api_id,
                            command: cmd.api_id,
                            parameter: Object.fromEntries([[cmd.args?.[0].name, e.detail.value]]),
                        });
                    }}
                />
            {/each}
        </Pane>
        <Pane position="inline" title="Movement">
            <RadioGrid
                values={['Slow', 'Normal', 'Fast']}
                value={speedLevel}
                on:change={handleSpeedChange}
                label="Speed Level"
                columns={3}
            />
            <RadioGrid
                values={['Idle', 'Trot', 'Running', 'Forward Climb', 'Reverse Climb']}
                value={gait}
                on:change={handleGaitChange}
                label="Gait"
                columns={3}
            />
            <RotationEuler
                bind:value={eulerAngles}
                expanded={true}
                label="Euler Angles"
                picker="inline"
                on:change={sendEuler}
            />
            <Button
                on:click={() =>
                    (eulerAngles = {
                        x: 0,
                        y: 0,
                        z: 0,
                    })}
                title="Reset"
            />

            <!-- <Point
            expanded={true}
            label="XY Pad"
            picker="inline"
            on:change={handleXYChange}
        /> -->
        </Pane>
    </div>
    <div class="video">
        <Video ws={websocket} />
    </div>
</div>

<style>
    .parent {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        grid-template-rows: auto repeat(4, 1fr);
        grid-column-gap: 2px;
        grid-row-gap: 2px;
    }

    .div2 {
        grid-area: 1 / 1 / 6 / 2;
    }
    .div3 {
        grid-area: 2 / 2 / 6 / 3;
    }
    .div4 {
        grid-area: 2 / 3 / 6 / 4;
    }
    .div5 {
        grid-area: 2 / 4 / 3 / 6;
    }
    .div6 {
        grid-area: 3 / 4 / 4 / 6;
    }
    .div7 {
        grid-area: 4 / 4 / 5 / 6;
    }
    .div8 {
        grid-area: 5 / 4 / 6 / 6;
    }

    .video {
        
        position: fixed;
        top: 0;
        left: 0;
        z-index: -100;
    }
</style>
