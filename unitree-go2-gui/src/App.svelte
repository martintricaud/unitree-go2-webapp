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
        Separator,
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
        exec_time?: number;
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

<Pane position="draggable">
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
    <Separator></Separator>
    <Element>
        <span>Commands</span>
    </Element>
    {#each commands_oneshot as { api_id, working }}
        {#if working}
            <Button
                on:click={() => websocket.send({ api_id: api_id, command: api_id })}
                title={api_id}
            />
        {/if}
    {/each}
    <Separator></Separator>
    <Element>
        <span>Movement modes</span>
    </Element>
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
    <Separator></Separator>
    <Element>
        <span>Movement</span>
    </Element>
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
</Pane>
<Video ws={websocket} />

<style>
    .parent {
        width: 100%;
        height: 100%;
        /* display: grid;
        grid-template-columns: repeat(5, 1fr);
        grid-template-rows: auto repeat(4, 1fr);
        grid-column-gap: 2px;
        grid-row-gap: 2px; */
    }
</style>
