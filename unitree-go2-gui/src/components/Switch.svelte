<script lang="ts">
    import * as R from 'ramda';
    export let value: boolean = false;
    export let label: string = '';
    export let callback: (a: boolean) => any = R.identity;
    let baseCallback: (e: MouseEvent) => boolean = (e) => {
        value = !value;
        return value;
    };
    
</script>

<div class="main">
    <div>{label}</div>
    <button
        aria-label="Basculer l'interrupteur"
        aria-checked={value}
        role="switch"
        class="switch"
        class:active={value}
        on:click={R.pipe(baseCallback, callback)}
    >
        <div class="slider"></div>
    </button>
</div>

<style>
    .main {
        display: flex;
        gap: 1em;
        align-items: center;
        justify-content: space-between;
    }
    :root {
        --switch-width: 3em;
        --switch-height: calc(var(--switch-width) / 2);
        --slider-size: calc(var(--switch-height) - 4px);
        --switch-padding: 2px;
        --switch-bg-color-off: #ccc;
        --switch-bg-color-on: #4caf50;
        --slider-color: white;
    }

    .switch {
        flex-shrink: 0;
        position: relative;
        width: var(--switch-width);
        height: var(--switch-height);
        padding: var(--switch-padding);
        background-color: var(--switch-bg-color-off);
        border: none;
        border-radius: var(--switch-height);
        cursor: pointer;
        transition: background-color 0.3s;
    }

    .switch.active {
        background-color: var(--switch-bg-color-on);
    }

    .slider {
        position: absolute;
        width: var(--slider-size);
        height: var(--slider-size);
        background-color: var(--slider-color);
        border-radius: 50%;
        top: 50%;
        transform: translateY(-50%);
        left: var(--switch-padding);
        transition: left 0.3s;
    }

    .switch.active .slider {
        left: calc(var(--switch-width) - calc(var(--slider-size)) - var(--switch-padding));
    }
</style>
