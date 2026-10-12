<script lang="ts">
    import type { OUTCOMES } from '../lib/stores/outcomes';

    export let status: 'pending' | keyof typeof OUTCOMES | null;
    /// A control shows nothing for a confirmed value.
    export let quiet = false;

    const MARKS = { pending: '…', confirmed: '✓', failed: '✗', rejected: '⊘', unknown: '?' };
</script>

{#if status !== null && !(quiet && status === 'confirmed')}{MARKS[status]}{/if}
