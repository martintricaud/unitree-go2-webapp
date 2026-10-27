<script lang="ts">
    let props: {
        /// Where the knob sits: the value the operator asked for. Its owner holds it: this component
        /// never writes it, so the switch cannot sit on a value its owner never agreed to.
        value: boolean;
        /// The track's colour: the value the robot has confirmed. It follows `value` when omitted, for
        /// switches that wait on no robot verdict.
        confirmed?: boolean;
        /// Draws a spinner in the track while a command waits for its verdict.
        spinning?: boolean;
        label: string;
        disabled?: boolean;
        callback: (next: boolean) => void;
    } = $props();
</script>


<div class="main">
    <div>{props.label}</div>
<button
    aria-label="Basculer l'interrupteur"
    aria-checked={props.value}
    role="switch"
    class="switch"
    class:on={props.confirmed ?? props.value}
    class:knob-right={props.value}
    disabled={props.disabled}
    onclick={() => props.callback(!props.value)}>
    <div class="slider"></div>
    {#if props.spinning}<span class="spinner" aria-label="waiting for the robot"></span>{/if}
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
        /* The knob's `left` is measured from the track's left edge, so the knob must start there
           instead of at the centre that the global button rule sets. */
        justify-content: flex-start;
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
        width: calc(var(--slider-size) - 6px);
        height: calc(var(--slider-size) - 6px);
        /* border-style: outset;
        border-width: 3px; */
        border: 1px solid #999;
        border-radius: 12px;
        transition: left 0.3s;
    }

    .switch.knob-right .slider {
        left: calc(var(--switch-width) - var(--slider-size) - var(--switch-padding));
    }

    /* Centred on the part of the track the knob does not cover. The track's inner width is
       --switch-width minus its 6px of border, and the knob is --slider-size minus 6px wide. */
    .spinner {
        position: absolute;
        top: 50%;
        left: calc((var(--switch-width) + var(--slider-size) - 12px) / 2);
        width: 10px;
        height: 10px;
        margin: -5px 0 0 -5px;
        border: 2px solid #555;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    .switch.knob-right .spinner {
        left: calc((var(--switch-width) - var(--slider-size)) / 2);
    }
</style>
