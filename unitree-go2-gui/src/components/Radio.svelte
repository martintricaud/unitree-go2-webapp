<script lang="ts">
    export let optionName: string;
    /// Whether the group is showing this option. Its owner holds it: this component never
    /// writes it, so the tick cannot sit on an option its owner never agreed to.
    export let selected: boolean = false;
    export let disabled: boolean = false;
    /// A short note after the option. Its owner uses it to say the robot has not confirmed the
    /// selection, and leaves it empty where there is nothing to confirm.
    export let marker: string = '';
    export let callback: () => void;
</script>

<button {disabled} on:click={callback}>
    {optionName}
    {#if selected}✅{/if}{marker}
</button>

<style>
    button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
</style>
