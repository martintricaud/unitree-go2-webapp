<script lang="ts">
    import { entries, isEmpty, isIncludedIn } from 'remeda';
    import { cueSheet } from '../lib/stores/cueSheet';
    import type { Cue } from '../lib/utils/commands';

    /// Top-level binding, so the markup can subscribe to it with `$strip`.
    const { strip } = cueSheet;

    /// The cell being dragged. -1 names no cell, and the store ignores an index outside the sheet,
    /// so a drop that no drag in the strip started moves nothing.
    let dragged = -1;

    /// The sweep in progress, as the cell the press started on and the cell under the pointer; empty
    /// while no button is pressed on a cell. A release on a cell completes the sweep; a release
    /// anywhere else only ends it.
    let sweeps: [number, number][] = [];

    /// The number of robot commands a group cell sends, counting its nested groups and not its
    /// waits; 0 for a cell that is not a group, so only a group shows a count.
    const commandCount = (_cell: Cue) =>
        isEmpty(_cell.items) ? 0 : _cell.steps.filter((_step) => _step.kind === 'command').length;

    /// Makes `_span` the editable label of cell `_index`. It takes the focus with its text selected,
    /// so typing replaces the label, and no typed key reaches the window shortcuts. Moving the focus
    /// out commits the label; Enter does that without typing a newline. Escape restores the previous
    /// label, and releasing Space types a space without clicking the cell.
    const editor = (_span: HTMLSpanElement, _index: number) => {
        const commit = () => cueSheet.rename(_index, _span.textContent ?? '');
        _span.addEventListener('focusout', commit);
        _span.addEventListener('keydown', (_event) => {
            _event.stopPropagation();
            if (_event.key === 'Enter') {
                _event.preventDefault();
                _span.blur();
            }
            if (_event.key === 'Escape') {
                // Chrome fires focusout on a focused element it removes, which would commit.
                _span.removeEventListener('focusout', commit);
                cueSheet.stopRenaming();
            }
        });
        _span.addEventListener('keyup', (_event) => {
            _event.stopPropagation();
            if (_event.key === ' ') _event.preventDefault();
        });
        _span.focus();
        getSelection()?.selectAllChildren(_span);
    };
</script>

<svelte:window on:pointerup={() => (sweeps = [])} />

<div id="sidebar" class="actionsequence" class:editing={$strip.tools !== null} style:cursor={$strip.cursor}>
    {#if $strip.tools}
        <div class="bar top">
            <button class:active={$strip.tools.active === 'Move'} on:click={$strip.tools.Move}>Move</button>
            <button class:active={$strip.tools.active === 'Rename'} on:click={$strip.tools.Rename}>Rename</button>
            <button class:active={$strip.tools.active === 'Group'} on:click={$strip.tools.Group}>Group</button>
            <button class:active={$strip.tools.active === 'Ungroup'} on:click={$strip.tools.Ungroup}>Ungroup</button>
        </div>
    {/if}
    {#each $strip.cells as cell, i}
        <button
            class="cell"
            class:active-step={i === $strip.pointer}
            class:pressed={i === $strip.pressed}
            class:swept={sweeps.some(([_from, _to]) => isIncludedIn(i, $strip.run(_from, _to)))}
            draggable={$strip.draggable}
            on:click={() => $strip.click(i)}
            on:pointerdown={() => (sweeps = [[i, i]])}
            on:pointerenter={() => (sweeps = sweeps.map(([_from]) => [_from, i]))}
            on:pointerup={() => sweeps.forEach(([_from, _to]) => $strip.sweep(_from, _to))}
            on:dragstart={() => (dragged = i)}
            on:dragover|preventDefault
            on:drop={() => cueSheet.reorder(dragged, i)}
            on:dragend={() => (dragged = -1)}
        >
            {#if $strip.renaming === i}
                <span contenteditable="plaintext-only" use:editor={i}>{cell.label}</span>
            {:else}
                <span>{cell.label}</span>
            {/if}
            {#if commandCount(cell) > 1}
                <span>({commandCount(cell)})</span>
            {/if}
        </button>
    {/each}
    <div class="bar bottom">
        {#each entries($strip.transitions) as [label, go]}
            <button on:click={go}>{label}</button>
        {/each}
    </div>
</div>

<style>
    /* The width fits the four tool buttons of the top bar on one line, and does not change between
       modes or with the labels. */
    .actionsequence {
        width: 19rem;
        display: flex;
        flex-direction: column;
        max-height: 100%;
        overflow-y: auto;
    }

    /* The bars stay at the top and the bottom of the scrolled strip; cells scroll under them. */
    .bar {
        position: sticky;
        z-index: 1;
        display: flex;
        background: rgb(230, 230, 230);
    }

    .bar button {
        flex: 1 1 auto;
    }

    .top {
        top: 0;
    }

    /* The top margin keeps the bar at the bottom of a strip shorter than the sidebar. */
    .bottom {
        bottom: 0;
        margin-top: auto;
    }

    .bar .active {
        border-style: inset;
        font-weight: bold;
    }

    /* A cell shows the strip's cursor, which depends on the tool. A long label wraps inside its cell.
       The label sits flush left and the command count flush right; the gap separates them, since
       a flex container drops the space. */
    .cell {
        justify-content: space-between;
        text-align: left;
        gap: 1ch;
        cursor: inherit;
        white-space: normal;
        overflow-wrap: anywhere;
    }

    .active-step {
        font-weight: bold;
        box-shadow: inset 0 0 10px rgb(0, 218, 163);
        border-color: rgb(0, 218, 163);
    }

    .swept {
        background: rgb(170, 200, 240);
    }

    .cell:active,
    .pressed {
        border-style: inset;
    }

    /* In edit mode a press starts a drag, a rename or a selection, not a cue, so the cell does not
       look pressed. */
    .editing .cell:active {
        border-style: outset;
    }
</style>
