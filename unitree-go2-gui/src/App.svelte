<script lang="ts">
    import * as R from 'ramda';
    import { onMount } from 'svelte';
    import {
        Checkbox,
        Element,
        ThemeUtils,
        RadioGrid,
        Button,
        Pane,
        Point,
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
    import commands from '../../commands_1.1.7.json';
    import { websocket, webSocketConnected, robotConnected } from './lib/webSocketClient';
    import { speedChangeMessage, gaitChangeMessage } from './lib/messageGenerators';
    import Video from './components/Video.svelte';

    let point2d: PointValue2d = { x: 0, y: 0 };

    ThemeUtils.setGlobalDefaultTheme(ThemeUtils.presets.retro);

    type CommandArg = {
        name: string;
        type: string;
    };

    // type Command = {
    //     command_name: string;
    //     api_code: number;
    //     description?: string;
    //     // args?: CommandArg[];
    //     exec_time?: number;
    // };

    type Command = {
        command_name: string;
        api_code: number;
        description?: string;
        args?: CommandArg[];
        working?: boolean;
        exec_time?: number;
        topic: string;
    };

    type ParametrizedCommand = Command & {
        args: CommandArg[];
    };

    let colors = ['🤍 white', '❤️ red', '💛 yellow', '💙 blue', '💚 green', '🩵 cyan', '💜 purple'];
    let color:
        | '🤍 white'
        | '❤️ red'
        | '💛 yellow'
        | '💙 blue'
        | '💚 green'
        | '🩵 cyan'
        | '💜 purple' = '🤍 white';
    let movementMode = '';
    let speedLevel: 'Slow' | 'Normal' | 'Fast' = 'Normal';
    let gait: 'Idle' | 'Trot' | 'Running' | 'Forward Climb' | 'Reverse Climb' = 'Trot';
    let handStandOn = false;

    // Command that have no arguments (one-shot commands)
    const commands_oneshot: Command[] = R.filter(R.complement(R.has('args')))(
        commands,
    ) as Command[];

    const commands_switches: Command[] = R.filter(
        (cmd: Command) =>
            R.has('args')(cmd) && cmd.args!.length === 1 && cmd.args![0].type === 'boolean',
    )(commands) as ParametrizedCommand[];

    const commands_switches_names: string[] = commands_switches.map(
        (command) => command.command_name,
    );

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

    function handleMove(e: PointChangeEvent) {
        const v = e.detail.value;
        const [x, y] = Array.isArray(v) ? v : [v.x, v.y];
        websocket.send({
            command_name: 'Move',
            parameter: { x, y, z: 0 },
        });
    }

    function sendEuler(event: RotationEulerChangeEvent) {
        // let _x: number = event.detail.value.x;
        // let _y: number = event.detail.value.y;
        // let _z: number = event.detail.value.z;
        // websocket.send({ command: 'set_orientation', _x, _y, _z });
    }

    function handleModeSwitch(event: RadioGridChangeEvent) {
        let mode = event.detail.value as string;
        //index commands by command_name for easy lookup of the one that was triggered by the radio change
        let commands = R.indexBy(R.prop('command_name'), commands_switches);
        //we are interested in the api_code and the name of the arguments expected by the command
        let command: ParametrizedCommand = commands[mode] as ParametrizedCommand;
        let payload = {
            api_code: command.api_code,
            parameter: R.objOf(command.args?.[0]?.name, true),
        };
        console.log(payload);
        // websocket.send({
        //     api_code: command.api_code,
        //     parameter: R.objOf(command.args?.[0]?.name, true),
        // });
        //Todo: turn on the mode, turn off the others
    }

    function handleColorChange(event: RadioGridChangeEvent) {
        let colorName = event.detail.value as string;
        console.log(colorName);
        websocket.send({
            topic: 'VUI',
            api_id: 1007,
            parameter: {
                color: colorName.split(' ')[1],
                time: 5,
                flash_cycle: 1000,
            },
        });
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

<Video/>
<div class="ui-pane">
    <div>
        <Button
            on:click={() => {
                $robotConnected ? disconnectRobot() : connectRobot();
            }}
            disabled={!$webSocketConnected}
            title={$robotConnected ? 'Disconnect' : 'Connect'}
        />
        <Element>
            <div class="double-col" style="font-size:x-small">
                <p>Websocket: {$webSocketConnected ? '✅' : '❌'}</p>
                <p>Robot: {$robotConnected ? '✅' : '❌'}</p>
            </div>
        </Element>
        <Button on:click={() => websocket.send({ command: 'subscribe' })} title="Monitor State" />
    </div>
    <div class="button-grid">
        {#each commands_oneshot as { api_code, working, command_name, topic }}
            {#if working}
                <Button
                    on:click={() =>
                        websocket.send({ api_id: api_code, command: command_name, topic: topic })}
                    title={command_name}
                />
            {/if}
        {/each}
    </div>
    <RadioGrid
        values={commands_switches_names}
        value={movementMode}
        on:change={handleModeSwitch}
        label="Mode"
        columns={2}
    />
    <RadioGrid
        values={colors}
        value={'white'}
        on:change={handleColorChange}
        label="Light Color"
        columns={1}
    />

    <Pane position="inline">
        <RadioGrid
            values={['Slow', 'Normal', 'Fast']}
            value={speedLevel}
            on:change={handleSpeedChange}
            label="Speed Level"
            columns={3}
        />
        <Point
            bind:value={point2d}
            expanded={true}
            label="2D Point Picker"
            picker="inline"
            userExpandable={false}
            on:change={handleMove}
        />
    </Pane>

    <RadioGrid
        values={['Idle', 'Trot', 'Running', 'Forward Climb', 'Reverse Climb']}
        value={gait}
        on:change={handleGaitChange}
        label="Gait"
        columns={2}
    />
    <Pane position="inline">
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
</div>

<style>
</style>
