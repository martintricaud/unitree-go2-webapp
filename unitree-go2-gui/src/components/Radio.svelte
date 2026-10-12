<script lang="ts">
    import type { ComponentProps } from 'svelte';
    import OutcomeMark from './OutcomeMark.svelte';

    export let optionName: string;
    /// Whether the group is showing this option. Its owner holds it: this component never
    /// writes it, so the tick cannot sit on an option its owner never agreed to.
    export let selected: boolean = false;
    export let disabled: boolean = false;
    export let status: ComponentProps<typeof OutcomeMark>['status'] = null;
    export let callback: () => void;
</script>

<button {disabled} on:click={callback}>
    {optionName}
    {#if selected}✅<OutcomeMark {status} quiet />{/if}
</button>

<style>
    button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
</style>
