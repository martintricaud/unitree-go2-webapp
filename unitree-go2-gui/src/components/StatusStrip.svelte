<script lang="ts">
    import { filter, flatMap, fromKeys, pipe, prop, set, sortBy, values } from 'remeda';
    import { robot } from '../lib/stores/robot.svelte';
    import { KINDS, LISTS, outcomeLog, summary } from '../lib/stores/outcomes.svelte';
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

    /// The robot's active faults, which the log button counts and the popover lists.
    const faults = $derived(values(robot.current.faults));

    /// Whether the log shows each kind of message; a filter button flips its kind.
    let shown = $state.raw(fromKeys(KINDS, () => true));

    /// The shown messages, newest first. Each kind's list is already newest first, so the sort
    /// only merges them.
    const listed = $derived(
        pipe(
            KINDS,
            filter((_kind) => shown[_kind]),
            flatMap((_kind) => outcomeLog.messages[_kind]),
            sortBy([prop('at'), 'desc']),
        ),
    );
</script>

<div class="strip">
    <!-- Three groups: the connection on the left, the controller and the edit mode centred, the
         last outcome and the log on the right. -->
    <div class="line">
        <div class="side">
            <button
                class="toggle"
                disabled={!robot.current.channelOpen}
                onclick={() => (robot.current.robotConnected ? robot.disconnectRobot() : robot.connectRobot('192.168.123.161'))}
            >
                {robot.current.robotConnected ? 'Disconnect' : 'Connect'}
            </button>
            <span>Websocket {robot.current.channelOpen ? '✅' : '❌'}</span>
            <span>Robot {robot.current.robotConnected ? '✅' : '❌'}</span>
        </div>
        <div class="centre">
            <button class="toggle" onclick={() => props.callback(!props.drawerOpen)}>
                {props.drawerOpen ? 'Hide' : 'Show'} controller
            </button>
            <!-- Edit mode is any instrument but Fire; the strip's Edit enters it with Move. -->
            {#if cueSheet.state.instrument === 'Fire'}
                <button class="toggle" onclick={() => cueSheet.choose('Move')}>Edit</button>
            {:else}
                <span class="edit">
                    <span class="button-row">
                        <button class="toggle" onclick={() => cueSheet.save()}>Save</button>
                        <button class="toggle" onclick={() => cueSheet.reset()}>Reset</button>
                        <button class="toggle" onclick={() => cueSheet.cancel()}>Cancel</button>
                    </span>
                    <span class="button-row">
                        <button class="toggle" onclick={() => picker.click()}>Import</button>
                        <button class="toggle" onclick={exportShown}>Export</button>
                    </span>
                </span>
                {#if cueSheet.state.problem !== null}
                    <span class="problem" title={cueSheet.state.problem}>{cueSheet.state.problem}</span>
                {/if}
            {/if}
            <input type="file" accept=".json,application/json" hidden bind:this={picker} onchange={importChosen} />
        </div>
        <div class="side end">
            <span class="last" title={outcomeLog.last?.detail ?? ''}>
                {#if outcomeLog.last === null}no command sent yet{:else}{summary(outcomeLog.last)}{/if}
            </span>
            <!-- The verdicts by outcome, then the active faults; a rejection by the WebRTC bridge
                 counts as a failure. -->
            <button class="toggle" popovertarget="outcome-log">
                Log ({outcomeLog.counts.confirmed} ✅, {outcomeLog.counts.unknown} ❓, {outcomeLog.counts.failed + outcomeLog.counts.rejected} ❌, {faults.length} ⚠️)
            </button>
        </div>
    </div>
    <div id="outcome-log" class="log" popover="auto">
        <div class="head">
            <!-- Each fault as the driver names it, then its source and its code in hexadecimal, as
                 the driver writes them. -->
            {#if faults.length > 0}
                <ul class="faults">
                    {#each faults as fault}
                        <li>{fault.text} ({fault.source}-{fault.code.toString(16).toUpperCase()})</li>
                    {/each}
                </ul>
            {/if}
            <div class="filters">
                {#each KINDS as kind}
                    <button class="toggle" aria-pressed={shown[kind]} onclick={() => (shown = set(shown, kind, !shown[kind]))}>
                        {LISTS[kind].label}
                    </button>
                {/each}
            </div>
        </div>
        <ol>
            <!-- Keyed by the entry object, which no two rows share even within one millisecond, so
                 a new message adds one row and leaves the others as they are. -->
            {#each listed as entry (entry)}
                <li>
                    <span class="clock">{new Date(entry.at).toLocaleTimeString()}</span>
                    <span class="kind">{LISTS[entry.kind].label}</span>
                    <span>{entry.summary}</span>
                    <span class="detail" title={entry.detail}>{entry.detail}</span>
                </li>
            {/each}
        </ol>
    </div>
</div>

<style>
    .strip {
        /* The log popover reads these properties to sit right above the strip. */
        --strip-height: 2.6rem;
        --strip-padding-x: 0.6rem;
        grid-area: strip;
        height: var(--strip-height);
        border-top: var(--divider);
        display: flex;
        align-items: center;
        background: rgb(230, 230, 230);
        padding: 0 var(--strip-padding-x);
    }


    /* The two sides share the width left by the centre equally, so the centre group is centred. */
    .line {
        flex: 1 1 auto;
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: 1.2em;
        white-space: nowrap;
    }

    .side,
    .centre {
        display: flex;
        align-items: center;
        gap: 1.2em;
        min-width: 0;
    }

    .end {
        justify-content: flex-end;
    }

    /* Takes the spare width, its text set against the log button it summarises. */
    .last {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: right;
    }

    /* The gap separates the two button rows. */
    .edit {
        display: flex;
        gap: 0.4em;
    }

    /* Valibot's message fits the line: its line break shows as a space, and its full text is in
       the title. */
    .problem {
        flex: 0 1 auto;
        min-width: 0;
        max-width: 30ch;
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

    /* The faults and the filters stay in view while the entries scroll under them. */
    .head {
        position: sticky;
        top: 0;
        background: inherit;
    }

    .faults {
        margin: 0 0 0.3rem;
        padding: 0 0 0.3rem;
        list-style: none;
        border-bottom: 1px solid #999;
        color: rgb(160, 0, 0);
    }

    /* A fault's text wraps rather than widen the popover past its 60 characters. */
    .log .faults li {
        white-space: normal;
    }

    .filters {
        display: flex;
        gap: 0.4em;
        padding-bottom: 0.3rem;
    }

    /* A pressed filter shows its kind. It is drawn as the controller draws a selected button. */
    .filters [aria-pressed='true'] {
        border-style: inset;
        background-color: #bbb;
    }

    .log ol {
        margin: 0;
        padding: 0;
    }

    /* A stream entry has no summary, so its empty slot takes no gap. */
    .log li span:empty {
        display: none;
    }

    .log li {
        display: flex;
        gap: 0.8em;
        white-space: nowrap;
    }

    .clock,
    .kind {
        color: #555;
    }

    .detail {
        color: #555;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
