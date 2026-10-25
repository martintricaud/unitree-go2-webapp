<script lang="ts">
    import { webSocketConnected, robotConnected } from '../lib/stores/connection';
    import { websocket } from '../lib/utils/webSocketClient';
    import { lastOutcome, outcomeCounts, outcomeLog } from '../lib/stores/outcomes';
    import type { Outcome } from '../lib/stores/outcomes';

    let showLog = false;

    /// Whether the controller sidebar is open. App.svelte owns it; this strip only asks to flip it.
    export let drawerOpen: boolean;
    export let callback: (next: boolean) => void;

    function connectRobot() {
        websocket.send({ command_name: 'connect', ip: '192.168.123.161' });
    }

    function disconnectRobot() {
        websocket.send({ command_name: 'disconnect' });
    }
</script>

{#snippet summary(entry: Outcome)}
    {entry.label} {entry.outcome}{entry.code === null ? '' : ` (${entry.code})`}
{/snippet}

<div class="strip">
    <div class="line">
        <button
            class="toggle"
            disabled={!$webSocketConnected}
            on:click={() => ($robotConnected ? disconnectRobot() : connectRobot())}
        >
            {$robotConnected ? 'Disconnect' : 'Connect'}
        </button>
        <button class="toggle" on:click={() => callback(!drawerOpen)}>
            {drawerOpen ? 'Hide' : 'Show'} controller
        </button>
        <span>Websocket {$webSocketConnected ? '✅' : '❌'}</span>
        <span>Robot {$robotConnected ? '✅' : '❌'}</span>
        <span class="last" title={$lastOutcome?.detail ?? ''}>
            {#if $lastOutcome === null}no command sent yet{:else}{@render summary($lastOutcome)}{/if}
        </span>
        <span>
            {$outcomeCounts.failed + $outcomeCounts.rejected} failed, {$outcomeCounts.unknown} unknown,
            {$outcomeCounts.confirmed} confirmed
        </span>
        <button class="toggle" on:click={() => (showLog = !showLog)}>
            {showLog ? 'Hide' : 'Show'} log ({$outcomeLog.length})
        </button>
    </div>
    {#if showLog}
        <ol class="log">
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
    {/if}
</div>

<style>
    .strip {
        grid-area: strip;
        background: rgb(230, 230, 230);
        border-top: 2px solid #999;
        padding: 0.2em 0.6em;
    }

    .line {
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

    .log {
        max-height: 12em;
        overflow-y: auto;
        margin: 0.3em 0 0;
        padding: 0 0 0 1.2em;
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
