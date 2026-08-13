<script lang="ts">
    /// What the switch shows. Its owner holds it: this component never writes it, so the
    /// switch cannot sit on a value its owner never agreed to.
    export let value: boolean = false;
    export let label: string = '';
    export let disabled: boolean = false;
    /// A short note beside the label. Its owner uses it to say the robot has not confirmed the
    /// value, and leaves it empty where there is nothing to confirm.
    export let marker: string = '';
    export let callback: (next: boolean) => void;
</script>


<div class="main">
    <div>{label} {marker}</div>
<button
    aria-label="Basculer l'interrupteur"
    aria-checked={value}
    role="switch"
    class="switch"
    class:active={value}
    {disabled}
    on:click={() => callback(!value)}>
    <div class="slider"></div>
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

    .switch.active {
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
</style>
