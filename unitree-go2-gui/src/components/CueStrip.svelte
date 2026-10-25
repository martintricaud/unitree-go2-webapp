<script lang="ts">
    import { entries, isIncludedIn } from 'remeda';
    import { cueSheet } from '../lib/stores/cueSheet';

    /// Top-level binding, so the markup can subscribe to it with `$strip`.
    const { strip } = cueSheet;

    /// The cell being dragged. -1 names no cell, and the store ignores an index outside the sheet,
    /// so a drop that no drag in the strip started moves nothing.
    let dragged = -1;

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

<div id="sidebar" class="actionsequence" style:cursor={$strip.cursor}>
    {#if $strip.tools}
        <div class="bar top">
            <button class:active={$strip.tools.active === 'Select'} on:click={$strip.tools.Select}>Select</button>
            <button class:active={$strip.tools.active === 'Rename'} on:click={$strip.tools.Rename}>Rename</button>
            <button disabled={!$strip.actions?.group} on:click={$strip.actions?.group}>Group</button>
            <button disabled={!$strip.actions?.ungroup} on:click={$strip.actions?.ungroup}>Ungroup</button>
        </div>
    {/if}
    {#each $strip.cells as cell, i}
        <button
            class="cell"
            class:active-step={i === $strip.pointer}
            class:pressed={i === $strip.pressed}
            class:selected={isIncludedIn(i, $strip.selection)}
            draggable={$strip.draggable && $strip.renaming !== i}
            on:click={(event) => $strip.click(i, event.shiftKey)}
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
        </button>
    {/each}
    <div class="bar bottom">
        {#each entries($strip.transitions) as [label, go]}
            <button on:click={go}>{label}</button>
        {/each}
    </div>
</div>

<style>
    .actionsequence {
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

    /* A cell shows the strip's cursor, which is a text cursor under the Rename tool. */
    .cell {
        cursor: inherit;
    }

    .active-step {
        font-weight: bold;
        box-shadow: inset 0 0 10px rgb(0, 218, 163);
        border-color: rgb(0, 218, 163);
    }

    .selected {
        background: rgb(170, 200, 240);
    }

    .cell:active,
    .pressed {
        border-style: inset;
    }
</style>
