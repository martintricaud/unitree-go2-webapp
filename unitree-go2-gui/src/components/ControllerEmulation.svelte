<script lang="ts">
    /// Each button occupies one cell of a 3×3 grid, given as "row / column".
    const DIRECTIONS = [
        { name: 'up', label: '▲', area: '1 / 2' },
        { name: 'left', label: '◀', area: '2 / 1' },
        { name: 'right', label: '▶', area: '2 / 3' },
        { name: 'down', label: '▼', area: '3 / 2' },
    ] as const;
    const ACTIONS = [
        { name: 'Y', label: 'Y', area: '1 / 2' },
        { name: 'X', label: 'X', area: '2 / 1' },
        { name: 'B', label: 'B', area: '2 / 3' },
        { name: 'A', label: 'A', area: '3 / 2' },
    ] as const;

    /// Called with `true` when a button is pressed and with `false` when it is released.
    export let callback: (button: (typeof DIRECTIONS | typeof ACTIONS)[number]['name'], pressed: boolean) => void;
    export let disabled: boolean = false;
</script>


<div class="controller">
    {#each [{ kind: 'dpad', buttons: DIRECTIONS }, { kind: 'actions', buttons: ACTIONS }] as block}
        <div class="block {block.kind}">
            {#each block.buttons as button}
                <button
                    aria-label={button.name}
                    style:grid-area={button.area}
                    {disabled}
                    on:pointerdown={() => callback(button.name, true)}
                    on:pointerup={() => callback(button.name, false)}
                    on:pointerleave={(event) => event.buttons && callback(button.name, false)}>
                    {button.label}
                </button>
            {/each}
            {#if block.kind === 'dpad'}<div class="center"></div>{/if}
        </div>
    {/each}
</div>


<style>
    .controller {
        display: flex;
        flex-direction: column;
        aspect-ratio: 1 / 2;
        width: 100%;
        background-color: #ddd;
        border: 1px solid #999;
        border-radius: 24px;
        overflow: hidden;
    }

    .block {
        aspect-ratio: 1;
        display: grid;
        grid-template: repeat(3, 1fr) / repeat(3, 1fr);
        padding: 15%;
        box-sizing: border-box;
    }

    button {
        padding: 0;
        border: 1px solid #999;
        background-color: rgb(230, 230, 230);
        cursor: pointer;
        touch-action: none;
        user-select: none;
    }

    button:active:not(:disabled) {
        background-color: #bbb;
    }

    button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    .dpad button {
        border-radius: 4px;
    }

    .center {
        grid-area: 2 / 2;
        background-color: rgb(230, 230, 230);
    }

    .actions button {
        border-radius: 50%;
        font-weight: bold;
    }
</style>
