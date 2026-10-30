<script lang="ts">
    let props: {
        optionName: string;
        /// Whether the group is showing this option. Its owner holds it: this component never
        /// writes it, so the tick cannot sit on an option its owner never agreed to.
        selected: boolean;
        /// Whether a command proposing this option is waiting for the robot's verdict.
        spinning: boolean;
        /// A greyed option is drawn as disabled and still takes clicks, which its owner ignores while
        /// the option has no effect.
        greyed?: boolean;
        callback: () => void;
    } = $props();
</script>

<button aria-disabled={props.greyed} onclick={props.callback}>
    {props.optionName}
    {#if props.spinning}<span class="spinner" aria-label="waiting for the robot"></span>{:else if props.selected}✅{/if}
</button>
