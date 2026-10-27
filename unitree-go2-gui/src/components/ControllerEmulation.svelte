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
    } = $props();
</script>


{#snippet control(button: (typeof DIRECTIONS | typeof FACE_BUTTONS)[number], title: string, selected: boolean)}
    <button
        aria-label={button.name}
        {title}
        class:selected
        style:grid-area={button.area}
        onpointerdown={() => props.callback(button.key, true)}
        onpointerup={() => props.callback(button.key, false)}
        onpointerleave={(event) => event.buttons && props.callback(button.key, false)}>
        {button.label}
    </button>
{/snippet}

<!-- A face button's title names the cell its key is linked to. Under Assign, a click on a face
     button selects its key, drawn pressed in. -->
<div class="controller">
    <div class="block dpad">
        {#each DIRECTIONS as button}
            {@render control(button, cueSheet.arrows[button.key].label, false)}
        {/each}
    </div>
    <div class="block actions">
        {#each FACE_BUTTONS as button}
            {@render control(button, cueSheet.linked(button.key)?.label ?? 'unassigned', cueSheet.state.key === button.key)}
        {/each}
    </div>
</div>
<!-- Both sets of controls take the same cell, the inactive one hidden, so that the bar, and with
     it the drawer, keeps one size under every instrument: the size of the wider set. -->
<div class="bar">
    <div class="controls" class:hidden={cueSheet.state.instrument === 'Assign'}>
        <button onclick={() => cueSheet.choose('Assign')}>Edit</button>
    </div>
    <div class="controls" class:hidden={cueSheet.state.instrument !== 'Assign'}>
        <button onclick={() => cueSheet.save()}>Save</button>
        <button onclick={() => cueSheet.reset()}>Reset</button>
        <button onclick={() => cueSheet.cancel()}>Cancel</button>
    </div>
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
    .controller button {
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

    .controller button:active {
        background-color: #bbb;
    }

    .controller button.selected {
        border-style: inset;
        border-width: 0.15em;
        background-color: #bbb;
    }

    .bar {
        display: grid;
        margin-top: 0.6em;
    }

    .controls {
        grid-area: 1 / 1;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        gap: 0.4em;
    }

    .hidden {
        visibility: hidden;
    }

    .dpad button {
        border-radius: 4px;
    }

    /* Each arm is open on the edge it shares with the centre cell, with square corners there, so the
       four arms and the centre form one cross. */
    .dpad button[aria-label='up'] {
        border-bottom: none;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }

    .dpad button[aria-label='down'] {
        border-top: none;
        border-top-left-radius: 0;
        border-top-right-radius: 0;
    }

    .dpad button[aria-label='left'] {
        border-right: none;
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
    }

    .dpad button[aria-label='right'] {
        border-left: none;
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
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
