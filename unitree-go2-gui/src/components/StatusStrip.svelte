<script lang="ts">
    import { robot } from '../lib/stores/robot.svelte';
    import { outcomeLog } from '../lib/stores/outcomes.svelte';
    import type { Outcome } from '../lib/stores/outcomes.svelte';
    import { cueSheet } from '../lib/stores/cueSheet.svelte';

    let props: {
        /// Whether the controller sidebar is open. App.svelte owns it; this strip only asks to flip it.
        drawerOpen: boolean;
        callback: (next: boolean) => void;
    } = $props();

    /// The hidden file input Import opens.
    let picker: HTMLInputElement;

    /// Imports the file chosen in the picker, then empties the picker, so that choosing the same
    /// file again imports it again.
    const importChosen = async () => {
        const text = await picker.files?.[0]?.text();
        picker.value = '';
        if (text !== undefined) cueSheet.import(text);
    };

    /// Downloads the shown document as `cue-sheet.json`.
    const exportShown = () => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([cueSheet.exported()], { type: 'application/json' }));
        link.download = 'cue-sheet.json';
        link.click();
        URL.revokeObjectURL(link.href);
    };
</script>

{#snippet summary(entry: Outcome)}
    {entry.label} {entry.outcome}{entry.code === null ? '' : ` (${entry.code})`}
{/snippet}

<div class="strip">
    <div class="line">
        <button
            class="toggle"
            disabled={!robot.current.channelOpen}
            onclick={() => (robot.current.robotConnected ? robot.disconnectRobot() : robot.connectRobot('192.168.123.161'))}
        >
            {robot.current.robotConnected ? 'Disconnect' : 'Connect'}
        </button>
        <button class="toggle" onclick={() => props.callback(!props.drawerOpen)}>
            {props.drawerOpen ? 'Hide' : 'Show'} controller
        </button>
        <!-- Edit mode is any instrument but Fire; the strip's Edit enters it with Move. -->
        {#if cueSheet.state.instrument === 'Fire'}
            <button class="toggle" onclick={() => cueSheet.choose('Move')}>Edit</button>
        {:else}
            <span class="edit">
                <button class="toggle" onclick={() => cueSheet.save()}>Save</button>
                <button class="toggle" onclick={() => cueSheet.reset()}>Reset</button>
                <button class="toggle" onclick={() => cueSheet.cancel()}>Cancel</button>
                <button class="toggle" onclick={() => picker.click()}>Import</button>
                <button class="toggle" onclick={exportShown}>Export</button>
            </span>
            {#if cueSheet.state.problem !== null}
                <span class="problem" title={cueSheet.state.problem}>{cueSheet.state.problem}</span>
            {/if}
        {/if}
        <input type="file" accept=".json,application/json" hidden bind:this={picker} onchange={importChosen} />
        <span>Websocket {robot.current.channelOpen ? '✅' : '❌'}</span>
        <span>Robot {robot.current.robotConnected ? '✅' : '❌'}</span>
        <span class="last" title={outcomeLog.last?.detail ?? ''}>
            {#if outcomeLog.last === null}no command sent yet{:else}{@render summary(outcomeLog.last)}{/if}
        </span>
        <!-- The verdicts by outcome; a rejection by the WebRTC bridge counts as a failure. -->
        <button class="toggle" popovertarget="outcome-log">
            Log ({outcomeLog.counts.confirmed} ✅, {outcomeLog.counts.unknown} ❓, {outcomeLog.counts.failed + outcomeLog.counts.rejected} ❌)
        </button>
    </div>
    <ol
        id="outcome-log"
        class="log"
        popover="auto"
    >
        <!-- Keyless on purpose: two verdicts can land in the same millisecond, and a
             duplicate key would take the whole strip down mid-performance. -->
        {#each outcomeLog.entries as entry}
            <li>
                <span class="clock">{new Date(entry.at).toLocaleTimeString()}</span>
                <span>{@render summary(entry)}</span>
                <span class="detail">{entry.detail}</span>
            </li>
        {/each}
    </ol>
</div>

<style>
    .strip {
        /* The log popover reads these properties to sit right above the strip. */
        --strip-height: 2.6rem;
        --strip-padding-x: 0.6rem;
        grid-area: strip;
        height: var(--strip-height);
        display: flex;
        align-items: center;
        background: rgb(230, 230, 230);
        border-top: 2px solid #999;
        padding: 0 var(--strip-padding-x);
    }


    .line {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-wrap: nowrap;
        align-items: center;
        gap: 1.2em;
        white-space: nowrap;
        overflow-x: auto;
    }

    /* Takes the spare width, its text set against the log button it summarises. */
    .last {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: right;
    }

    .edit {
        display: flex;
        gap: 0.4em;
    }

    /* Valibot's message fits the line: its line break shows as a space, and its full text is in
       the title. */
    .problem {
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: rgb(160, 0, 0);
    }

    .toggle {
        min-height: 1.8em;
        padding: 0.1em 0.6em;
        border-width: 2px;
    }

    /* The reset removes most of the browser's popover styles, so the popover draws itself. It sits
       at the bottom right of the screen, just above the strip, under the log button; its width
       fits its content between 40 and 60 characters of its font. */
    .log {
        position: fixed;
        inset: auto calc(var(--app-border) + var(--strip-padding-x)) calc(var(--app-border) + var(--strip-height)) auto;
        min-width: 40ch;
        max-width: 60ch;
        margin: 0;
        min-height: 8lh;
        max-height: 50vh;
        overflow-y: auto;
        padding: 0.3rem 0.6rem;
        border: 2px solid #999;
        border-bottom: none;
        background: rgb(240, 240, 240);
    }

    .log li {
        display: flex;
        gap: 0.8em;
        white-space: nowrap;
    }

    .clock {
        color: #555;
    }

    .detail {
        color: #555;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
