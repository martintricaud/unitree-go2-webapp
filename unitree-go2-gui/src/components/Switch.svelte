<script lang="ts">
    /// Where the knob sits: the value the operator asked for. Its owner holds it: this component
    /// never writes it, so the switch cannot sit on a value its owner never agreed to.
    export let value: boolean = false;
    /// The track's colour: the value the robot has confirmed. It follows `value` when omitted, for
    /// switches that wait on no robot verdict.
    export let confirmed: boolean | undefined = undefined;
    /// Draws a spinner in the track while a command waits for its verdict.
    export let spinning: boolean = false;
    export let label: string = '';
    export let disabled: boolean = false;
    export let callback: (next: boolean) => void;
</script>


<div class="main">
    <div>{label}</div>
<button
    aria-label="Basculer l'interrupteur"
    aria-checked={value}
    role="switch"
    class="switch"
    class:on={confirmed ?? value}
    class:active={value}
    {disabled}
    on:click={() => callback(!value)}>
    <div class="slider"></div>
    {#if spinning}<span class="spinner" aria-label="waiting for the robot"></span>{/if}
</button>
</div>


<style>
    .main{
        display: flex;
        gap: 1em;
        align-items: center;
        justify-content: space-between;
    }
    :root {
        --switch-width: 48px;
        --switch-height: 26px;
        --slider-size: 26px;
        --switch-padding: 0px;
        --switch-bg-color-off: #ccc;
        --switch-bg-color-on: #4caf50;
        --slider-color: white;
    }

    .switch {
        font-size: 0;
        flex-shrink: 0;
        position: relative;
        width: var(--switch-width);
        line-height: 1;
        height: 24px;
        padding: 0!;
        background-color: var(--switch-bg-color-off);
        border-width: 3px;
        border-style: inset;
        border-radius: 12px;
        cursor: pointer;
        transition: background-color 0.3s;
    }

    .switch.on {
        background-color: var(--switch-bg-color-on);
    }

    .switch:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .slider {
        background-color: rgb(230, 230, 230);
        position: relative;
        left:-1px;
        top: -1px;
        width: calc(var(--slider-size) - 6px);
        height: calc(var(--slider-size) - 6px);
        /* border-style: outset;
        border-width: 3px; */
        border: 1px solid #999;
        border-radius: 12px;
        transition: left 0.3s;
    }

    .switch.active .slider {
        left: calc(var(--switch-width) - var(--slider-size) - var(--switch-padding));
    }

    /* Centred in the track, so the knob covers it on neither side. */
    .spinner {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 8px;
        height: 8px;
        margin: -6px 0 0 -6px;
        border: 2px solid #555;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
