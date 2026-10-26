<script lang="ts">
    import { robot } from '../lib/stores/robot';
    import { lastOutcome, outcomeCounts, outcomeLog } from '../lib/stores/outcomes';
    import type { Outcome } from '../lib/stores/outcomes';

    /// Whether the log popover is open. The browser owns the popover; its toggle event keeps this in step.
    let logOpen = false;

    /// Whether the controller sidebar is open. App.svelte owns it; this strip only asks to flip it.
    export let drawerOpen: boolean;
    export let callback: (next: boolean) => void;
</script>

{#snippet summary(entry: Outcome)}
    {entry.label} {entry.outcome}{entry.code === null ? '' : ` (${entry.code})`}
{/snippet}

<div class="strip">
    <div class="line">
        <button
            class="toggle"
            disabled={!$robot.channelOpen}
            on:click={() => ($robot.robotConnected ? robot.disconnectRobot() : robot.connectRobot('192.168.123.161'))}
        >
            {$robot.robotConnected ? 'Disconnect' : 'Connect'}
        </button>
        <button class="toggle" on:click={() => callback(!drawerOpen)}>
            {drawerOpen ? 'Hide' : 'Show'} controller
        </button>
        <span>Websocket {$robot.channelOpen ? '✅' : '❌'}</span>
        <span>Robot {$robot.robotConnected ? '✅' : '❌'}</span>
        <span class="last" title={$lastOutcome?.detail ?? ''}>
            {#if $lastOutcome === null}no command sent yet{:else}{@render summary($lastOutcome)}{/if}
        </span>
        <span>
            {$outcomeCounts.failed + $outcomeCounts.rejected} failed, {$outcomeCounts.unknown} unknown,
            {$outcomeCounts.confirmed} confirmed
        </span>
        <button class="toggle" popovertarget="outcome-log">
            {logOpen ? 'Hide' : 'Show'} log ({$outcomeLog.length})
        </button>
    </div>
    <ol id="outcome-log" class="log" popover="auto" on:toggle={(event) => (logOpen = event.newState === 'open')}>
        <!-- Keyless on purpose: two verdicts can land in the same millisecond, and a
             duplicate key would take the whole strip down mid-performance. -->
        {#each $outcomeLog as entry}
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

    /* The reset removes most of the browser's popover styles, so the popover draws itself.
       The browser's `width: fit-content` survives the reset; `width: auto` lets left and right set it. */
    .log {
        position: fixed;
        inset: auto calc(var(--app-border) + var(--strip-padding-x)) calc(var(--app-border) + var(--strip-height));
        width: auto;
        margin: 0;
        max-height: 12rem;
        overflow-y: auto;
        padding: 0.3rem 0.6rem;
        border: 2px solid #999;
        border-bottom: none;
        background: rgb(240, 240, 240);
    }

    .log li {
        display: flex;
        gap: 0.8em;
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
