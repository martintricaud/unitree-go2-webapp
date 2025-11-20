<script lang="ts">
    import { onMount } from 'svelte';
    import Toggle from './components/Toggle.svelte';
    import {
        Element,
        ThemeUtils,
        Separator,
        Checkbox,
        RadioGrid,
        Point,
        Button,
        Pane,
        RotationEuler,
        type RotationEulerValueObject,
        type CheckboxChangeEvent,
        type RadioGridChangeEvent,
        type PointValue2d,
        type PointChangeEvent,
        type RotationEulerChangeEvent,
    } from 'svelte-tweakpane-ui';
    import { commands_switches, commands_oneshot } from './lib/commands';
    import webSocketClient, {
        connectClient,
        send,
        webSocketConnected,
        robotConnected,
    } from './lib/webSocketClient';

    ThemeUtils.setGlobalDefaultTheme(ThemeUtils.presets.retro);
    type Mode = 'AI' | 'SPORT';
    let mode: Mode = 'SPORT';

    // Vite: import as URL so <audio> / new Audio() works
    const files = import.meta.glob('/src/assets/audio/*', {
        eager: true,
        as: 'url',
    });
    // Turn the object into an array we can iterate over
    const audioList = Object.entries(files).map(([path, url]) => ({
        name: path.split('/').pop(),
        url,
    }));

    function play(url: string) {
        new Audio(url).play();
    }

    let eulerAngles: RotationEulerValueObject = {
        x: 0,
        y: 0,
        z: 0,
    };

    // let webSocketConnected = false;
    // let connectionPending = false;
    // let robotConnected = false;

    onMount(() => {
        connectClient();

        // // Subscribe to state updates from webSocketClient
        // const unsubscribe = onState((state) => {
        //     webSocketConnected = state.webSocketConnected;
        //     console.log(webSocketConnected);
        //     robotConnected = state.robotConnected;
        // });

        // return () => unsubscribe();
    });

    async function connectRobot() {
        try {
            await send({ command: 'connect', ip: '192.168.123.161' });
            // Optionally, you can check for a successful connection response here
        } catch (error) {
            console.error('Connection failed:', error); // Handle any errors
        }
    }

    function disconnectRobot() {
        send({ command: 'disconnect' });
    }

    function handleModeChange(event: RadioGridChangeEvent) {
        mode = event.detail.value as Mode;
        send({ command: 'set_mode', mode });
    }

    function sendEuler(event: RotationEulerChangeEvent) {
        let _x: number = event.detail.value.x;
        let _y: number = event.detail.value.y;
        let _z: number = event.detail.value.z;

        send({ command: 'set_orientation', _x, _y, _z });
    }

    // Convert XY pad updates into move commands.
    function handleXYChange(event: PointChangeEvent) {
        const value = event.detail.value as PointValue2d;
        let x: number;
        let y: number;

        if (Array.isArray(value)) {
            [x, y] = value;
        } else {
            ({ x, y } = value);
        }
        send({ command: 'move', x, y });
    }
</script>

<div>
    <div style="display:flex">
        <p>WS: {$webSocketConnected ? 'connected' : 'disconnected'}</p>
        <p>Robot: {$robotConnected ? 'connected' : 'disconnected'}</p>
        <Button
            on:click={() => connectRobot()}
            disabled={!$webSocketConnected || $robotConnected}
            title="Connect Robot"
        />
        <RadioGrid
            values={['SPORT', 'AI']}
            value={mode}
            on:change={handleModeChange}
            label="Mode"
            columns={2}
        />
    </div>

    <Pane title="Control buttons">
        {#each commands_oneshot as { api_method, description, modeCompatibility }}
            <Button
                on:click={() => send({ command: api_method })}
                disabled={modeCompatibility ? !modeCompatibility[mode] : false}
                title={description}
            />
        {/each}
        <Separator />
        {#each commands_switches as { api_method, description, modeCompatibility }}
            <Button
                on:click={() => send({ command: api_method })}
                disabled={modeCompatibility ? !modeCompatibility[mode] : false}
                title={description}
            />
        {/each}
    </Pane>
    <Pane title="Audio">
        {#each audioList as file}
            <Button title={file.name} on:click={() => play(file.url)} />
        {/each}
    </Pane>
    <Pane title="Movement">
        <RotationEuler
            bind:value={eulerAngles}
            expanded={true}
            label="CSS Rotation"
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

    <Pane title="Video Stream">
        <Element>
            <video
                autoplay
                playsinline
                style="max-width: 100%; height: auto; border: 1px solid #ccc; background: #000;"
            >
                <!-- Minimal captions track to satisfy accessibility requirement -->
                <track kind="captions" srclang="en" label="English captions" default />
                Your browser does not support video playback.
            </video>
        </Element>
    </Pane>
</div>
