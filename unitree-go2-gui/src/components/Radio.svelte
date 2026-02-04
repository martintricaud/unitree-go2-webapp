
<script lang="ts">
    import * as R from 'ramda';
    import { onMount } from 'svelte';
    import type {Writable } from 'svelte/store'
    type RadioGroupData = {
        currentOption: string;
        // uncomment the line below to store the optionNames of all radiobuttons that target this store
        options: any[];
    }
    export let optionName: string = '';
    export let radioGroupData:Writable<RadioGroupData>
    export let callback: (a: string) => any = R.identity;
    let baseCallback = (ev:MouseEvent) => {
        radioGroupData.update(R.assoc('currentOption', optionName))
        return optionName;
    }
    onMount(() => {
        // Uncomment the line below to store the optionNames of all radiobuttons that target this store
        // radioGroupData.update(R.over(R.lensProp('options'), R.append(optionName)))
    })
</script>
<!-- The effect of clicking the button is given by the composition of the baseCallback and the custom callback passed as prop upon instanciation-->
<button on:click = {R.pipe(baseCallback, callback)}>
    {optionName}
    {#if $radioGroupData.currentOption === optionName}✅{/if}
</button>
