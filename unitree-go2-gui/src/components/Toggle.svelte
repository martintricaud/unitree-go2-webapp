<script lang="ts">
    import { onDestroy } from 'svelte';
    import type { Writable } from 'svelte/store';

    export let store: Writable<boolean>;
    export let onToggle: (next: boolean) => void = () => {};

    let value = false;

    const unsubscribe = store.subscribe((v) => (value = v));
    onDestroy(unsubscribe);

    function requestToggle() {
        onToggle(!value);
    }
</script>

<button
    type="button"
    class="switch"
    class:active={value}
    on:click={requestToggle}
    aria-pressed={value}
>
    <div class="thumb"></div>
</button>

<style>
    button.switch {
        width: 44px;
        height: 24px;
        border-radius: 24px;
        background: #999;
        padding: 2px;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        transition: background 120ms;
    }

    button.switch.active {
        background: #4caf50;
    }

    .thumb {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: white;
        transition: transform 120ms;
    }

    button.switch.active .thumb {
        transform: translateX(20px);
    }
</style>
