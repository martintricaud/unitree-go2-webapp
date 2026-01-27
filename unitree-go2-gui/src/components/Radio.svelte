
<script lang="ts">
    // The logic of the radio-button component should be implemented in a comonadic way, i.e. as a contextful computation.

    import * as R from 'ramda';
    import { onMount } from 'svelte';
    import type {Writable } from 'svelte/store'
    type RadioGroupData = {
        options: any[];
        focus: string;
    }
    export let optionName: string = '';
    export let radioGroupData:Writable<RadioGroupData>
    export let callback: (a: string) => any = R.identity;
    let baseCallback = (ev:MouseEvent) => {
        radioGroupData.update(R.assoc('focus', optionName))
        return optionName;
    }
    //appends an option with the given name to a list of options
    let appendOption = (_optionName:string) => R.modify('options',R.append(_optionName))
    onMount(() => {
        radioGroupData.update(appendOption(optionName))
    });
</script>

<button on:click = {R.pipe(baseCallback, callback)}>
    {optionName}
    {#if $radioGroupData.focus === optionName}✅{/if}
</button>
