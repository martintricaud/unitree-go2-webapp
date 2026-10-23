<script lang="ts">
    export let optionName: string;
    /// Whether the group is showing this option. Its owner holds it: this component never
    /// writes it, so the tick cannot sit on an option its owner never agreed to.
    export let selected: boolean = false;
    /// Whether a command proposing this option is waiting for the robot's verdict.
    export let spinning: boolean = false;
    export let disabled: boolean = false;
    export let callback: () => void;
</script>

<button {disabled} on:click={callback}>
    {optionName}
    {#if spinning}<span class="spinner" aria-label="waiting for the robot"></span>{:else if selected}✅{/if}
</button>

<style>
    button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .spinner {
        display: inline-block;
        width: 0.8em;
        height: 0.8em;
        margin-left: 0.3em;
        vertical-align: middle;
        border: 2px solid currentColor;
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
