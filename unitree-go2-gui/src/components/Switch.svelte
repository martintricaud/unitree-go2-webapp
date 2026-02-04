<script lang="ts">
    import * as R from 'ramda'
    export let value: boolean = false;
    export let label: string = "";
    let baseCallback:(e:MouseEvent)=>boolean = (e) => {
        value = !value
        return value
    }
    export let callback: (a:boolean)=>any = R.identity
</script>


<div class="main">
    <div>{label}</div>
<button
    aria-label="Basculer l'interrupteur"
    aria-checked={value}
    role="switch"
    class="switch"
    class:active={value}
    on:click={R.pipe(baseCallback, callback)}>
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
