<script lang="ts">
    import { entries, isIncludedIn } from 'remeda';
    import { cueSheet } from '../lib/stores/cueSheet';

    /// Top-level binding, so the markup can subscribe to it with `$strip`.
    const { strip } = cueSheet;

    /// The cell being dragged. -1 names no cell, and the store ignores an index outside the sheet,
    /// so a drop that no drag in the strip started moves nothing.
    let dragged = -1;

    /// The editable label of the cell being renamed, while that label exists.
    let editor: HTMLSpanElement | null = null;

    /// Focuses a label that has just become editable and selects its text, so typing replaces it.
    const opened = (_span: HTMLSpanElement) => {
        _span.focus();
        getSelection()?.selectAllChildren(_span);
    };

    /// Gives cell `_index` the label typed into the editor.
    const commit = (_index: number) => cueSheet.rename(_index, editor?.textContent ?? '');

    /// While cell `_index` is renamed, no key reaches the window shortcuts. Enter commits the label
    /// without typing a newline; Escape restores the previous label.
    const keydown = (_index: number) => (_event: KeyboardEvent) => {
        if ($strip.renaming !== _index) return;
        _event.stopPropagation();
        if (_event.key === 'Enter') {
            _event.preventDefault();
            commit(_index);
        }
        if (_event.key === 'Escape') cueSheet.stopRenaming();
    };

    /// While cell `_index` is renamed, releasing Space types a space but does not click the cell.
    const keyup = (_index: number) => (_event: KeyboardEvent) => {
        if ($strip.renaming !== _index) return;
        _event.stopPropagation();
        if (_event.key === ' ') _event.preventDefault();
    };

    /// Moving the focus out of the label commits it. Focusing the label fires focusout on the cell
    /// itself, which must not commit.
    const focusout = (_index: number) => (_event: FocusEvent) => {
        if ($strip.renaming === _index && _event.target === editor) commit(_index);
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
            on:keydown={keydown(i)}
            on:keyup={keyup(i)}
            on:focusout={focusout(i)}
            on:dragstart={() => (dragged = i)}
            on:dragover|preventDefault
            on:drop={() => cueSheet.reorder(dragged, i)}
            on:dragend={() => (dragged = -1)}
        >
            {#if $strip.renaming === i}
                <span contenteditable="plaintext-only" bind:this={editor} use:opened>{cell.label}</span>
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
