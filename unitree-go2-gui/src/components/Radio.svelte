
<script lang="ts">
    // The logic of the radio-button component should be implemented in a comonadic way, i.e. as a contextful computation.

    import * as R from 'ramda';
    import { onMount } from 'svelte';
    import { writable, get } from 'svelte/store';
    import type {Writable } from 'svelte/store'
    type RadioGroupData = {
        options: any[];
        focus: string;
    }
    export let optionName: string = '';
    export let radioGroupData:Writable<RadioGroupData>

    //appends an option with the given name to a list of options
    let appendOption = (_optionName:string) => R.modify('options',R.append(_optionName))
    onMount(() => {
        radioGroupData.update(appendOption(optionName))
    });
</script>

<button on:click = {() => radioGroupData.update(R.assoc('focus', optionName))}>
    {optionName}
    {#if $radioGroupData.focus === optionName}✅{/if}
</button>

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
