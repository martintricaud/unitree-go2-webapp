<script lang="ts">
    import { cueSheet } from '../lib/stores/cueSheet.svelte';

    /// Each button stands for the keyboard key `key`, and occupies one cell of a 3×3 grid, given as
    /// "row / column".
    const DIRECTIONS = [
        { name: 'up', key: 'ArrowUp', label: '▲', area: '1 / 2' },
        { name: 'left', key: 'ArrowLeft', label: '◀', area: '2 / 1' },
        { name: 'right', key: 'ArrowRight', label: '▶', area: '2 / 3' },
        { name: 'down', key: 'ArrowDown', label: '▼', area: '3 / 2' },
    ] as const;
    const FACE_BUTTONS = [
        { name: 'Y', key: 'y', label: 'Y', area: '1 / 2' },
        { name: 'X', key: 'x', label: 'X', area: '2 / 1' },
        { name: 'B', key: 'b', label: 'B', area: '2 / 3' },
        { name: 'A', key: 'a', label: 'A', area: '3 / 2' },
    ] as const;

    let props: {
        /// Called with the button's key, and with `true` when the button is pressed and `false` when
        /// it is released.
        callback: (key: (typeof DIRECTIONS | typeof FACE_BUTTONS)[number]['key'], pressed: boolean) => void;
        disabled?: boolean;
    } = $props();
</script>


<div class="controller">
    {#each [{ kind: 'dpad', buttons: DIRECTIONS }, { kind: 'actions', buttons: FACE_BUTTONS }] as block}
        <div class="block {block.kind}">
            {#each block.buttons as button}
                <button
                    aria-label={button.name}
                    title={cueSheet.bindings[button.key].label}
                    style:grid-area={button.area}
                    disabled={props.disabled}
                    onpointerdown={() => props.callback(button.key, true)}
                    onpointerup={() => props.callback(button.key, false)}
                    onpointerleave={(event) => event.buttons && props.callback(button.key, false)}>
                    {button.label}
                </button>
            {/each}
        </div>
    {/each}
</div>


<style>
    /* Every size inside is a fraction of this element's width, so the emulator scales with its
       container. The radius is 15% of the width on both axes: the height is twice the width. */
    .controller {
        container-type: inline-size;
        display: flex;
        flex-direction: column;
        aspect-ratio: 1 / 2;
        width: 100%;
        background-color: #ddd;
        border: 1px solid #999;
        border-radius: 15% / 7.5%;
        overflow: hidden;
        /* Stacked shadows of growing blur fade out more smoothly than a single one. */
        box-shadow:
            0 1px 2px rgb(0 0 0 / 0.08),
            0 4px 8px rgb(0 0 0 / 0.08),
            0 12px 24px rgb(0 0 0 / 0.12);
    }

    /* minmax(0, 1fr) lets a track shrink below its button's content, so the block stays square. */
    .block {
        aspect-ratio: 1;
        display: grid;
        grid-template: repeat(3, minmax(0, 1fr)) / repeat(3, minmax(0, 1fr));
        padding: 15%;
        box-sizing: border-box;
    }

    /* Overrides the global button rule's min-height, padding and border, which are in em and
       would not scale. */
    button {
        min-height: 0;
        padding: 0;
        font-size: 10cqi;
        line-height: 1;
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

    /* The d-pad's centre cell, between its four buttons. */
    .dpad::after {
        content: '';
        grid-area: 2 / 2;
        background-color: rgb(230, 230, 230);
    }

    .actions button {
        border-radius: 50%;
        font-weight: bold;
    }
</style>
