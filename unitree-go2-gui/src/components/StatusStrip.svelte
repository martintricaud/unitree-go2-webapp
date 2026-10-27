<script lang="ts">
    import { robot } from '../lib/stores/robot';
    import { outcomeLog } from '../lib/stores/outcomes.svelte';
    import type { Outcome } from '../lib/stores/outcomes.svelte';

    /// Whether the log popover is open. The browser owns the popover; its toggle event keeps this in step.
    let logOpen = $state(false);

    let props: {
        /// Whether the controller sidebar is open. App.svelte owns it; this strip only asks to flip it.
        drawerOpen: boolean;
        callback: (next: boolean) => void;
    } = $props();
</script>

{#snippet summary(entry: Outcome)}
    {entry.label} {entry.outcome}{entry.code === null ? '' : ` (${entry.code})`}
{/snippet}

<div class="strip">
    <div class="line">
        <button
            class="toggle"
            disabled={!$robot.channelOpen}
            onclick={() => ($robot.robotConnected ? robot.disconnectRobot() : robot.connectRobot('192.168.123.161'))}
        >
            {$robot.robotConnected ? 'Disconnect' : 'Connect'}
        </button>
        <button class="toggle" onclick={() => props.callback(!props.drawerOpen)}>
            {props.drawerOpen ? 'Hide' : 'Show'} controller
        </button>
        <span>Websocket {$robot.channelOpen ? '✅' : '❌'}</span>
        <span>Robot {$robot.robotConnected ? '✅' : '❌'}</span>
        <span class="last" title={outcomeLog.last?.detail ?? ''}>
            {#if outcomeLog.last === null}no command sent yet{:else}{@render summary(outcomeLog.last)}{/if}
        </span>
        <span>
            {outcomeLog.counts.failed + outcomeLog.counts.rejected} failed, {outcomeLog.counts.unknown} unknown,
            {outcomeLog.counts.confirmed} confirmed
        </span>
        <button class="toggle" popovertarget="outcome-log">
            {logOpen ? 'Hide' : 'Show'} log ({outcomeLog.entries.length})
        </button>
    </div>
    <ol
        id="outcome-log"
        class="log"
        popover="auto"
        ontoggle={(event) => (logOpen = event.newState === 'open')}
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

    .last {
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
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
