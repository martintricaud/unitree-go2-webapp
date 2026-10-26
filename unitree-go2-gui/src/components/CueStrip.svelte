<script lang="ts">
    import { filter, flatMap, forEach, isEmpty, isIncludedIn, last, map, pipe, range } from 'remeda';
    import { cueSheet, span } from '../lib/stores/cueSheet.svelte';
    import type { Cue } from '../lib/utils/commands';

    /// The strip's root element, whose drawn cells give each cell its index.
    let strip: HTMLDivElement;

    /// The sweep in progress, as the cell `a` the press started on and the cell `b` under the pointer;
    /// empty while no button is pressed on a cell. A release on a cell completes the sweep; a release
    /// anywhere else only ends it.
    let sweeps: { a: number; b: number }[] = [];

    /// The indices of the cells the sweep in progress highlights.
    $: swept = flatMap(sweeps, ({ a, b }) => pipe(span(a, b), ([_lo, _hi]) => range(_lo, _hi + 1)));

    /// The index of the cell `_event` targets, as zero or one index: the cell's position among the
    /// drawn cells. None outside every cell, and none inside the label being renamed, so a press
    /// there places the caret.
    const cellAt = ({ target }: Event) => {
        const cell = target instanceof HTMLElement && !target.isContentEditable && target.closest('[data-index]');
        return flatMap([...strip.querySelectorAll('[data-index]')], (_cell, _index) => (_cell === cell ? [_index] : []));
    };

    /// The number of robot commands a group cell sends, counting its nested groups and not its
    /// waits; 0 for a cell that is not a group, so only a group shows a count.
    const commandCount = (_cell: Cue) =>
        isEmpty(_cell.items) ? 0 : filter(_cell.steps, (_step) => _step.kind === 'command').length;

    /// Makes `_span` the editable label of cell `_index`. It takes the focus with its text selected,
    /// so typing replaces the label, and no typed key reaches the window shortcuts. Moving the focus
    /// out commits the label; Enter does that without typing a newline. Escape restores the previous
    /// label.
    const editor = (_span: HTMLSpanElement, _index: number) => {
        const commit = () => cueSheet.rename(_index, _span.textContent ?? '');
        _span.addEventListener('focusout', commit);
        _span.addEventListener('keyup', (_event) => _event.stopPropagation());
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
        _span.focus();
        getSelection()?.selectAllChildren(_span);
    };
</script>

<svelte:window onpointerup={() => (sweeps = [])} />

<div
    id="sidebar"
    class="actionsequence"
    style:cursor={cueSheet.instruments[$cueSheet.instrument].cursor}
    bind:this={strip}
    onpointerdown={(event) => (sweeps = map(cellAt(event), (_index) => ({ a: _index, b: _index })))}
    onpointerover={(event) => (sweeps = map(sweeps, ({ a, b }) => ({ a, b: last([b, ...cellAt(event)]) })))}
    onpointerup={(event) => forEach(sweeps, ({ a }) => forEach(cellAt(event), (_b) => cueSheet.sweep(a, _b)))}
>
    {#if $cueSheet.instrument !== 'Fire'}
        <div class="bar top">
            {#each ['Move', 'Rename', 'Group', 'Ungroup'] as const as name}
                <button class:active={$cueSheet.instrument === name} onclick={() => cueSheet.choose(name)}>{name}</button>
            {/each}
        </div>
    {/if}
    {#each $cueSheet.cells as cell, i}
        <div class="cell" data-index={i} class:active-step={i === $cueSheet.pointer} class:pressed={i === $cueSheet.pressed}
            class:swept={isIncludedIn(i, swept)}>
            {#if $cueSheet.renaming === i}
                <span contenteditable="plaintext-only" use:editor={i}>{cell.label}</span>
            {:else}
                <span>{cell.label}</span>
            {/if}
            {#if commandCount(cell) > 1}
                <span>({commandCount(cell)})</span>
            {/if}
        </div>
    {/each}
    <div class="bar bottom">
        {#if $cueSheet.instrument === 'Fire'}
            <button onclick={() => cueSheet.choose('Move')}>Edit</button>
        {:else}
            <button onclick={() => cueSheet.save()}>Save</button>
            <button onclick={() => cueSheet.reset()}>Reset</button>
            <button onclick={() => cueSheet.cancel()}>Cancel</button>
        {/if}
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

    /* A cell is drawn as the app's buttons are, with no pressed look of its own: only the keys draw a
       cell pressed. A long label wraps inside its cell. The label sits flush left and the command
       count flush right; the gap separates them, since a flex container drops the space. */
    .cell {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1ch;
        min-height: 3em;
        padding: 0.6em;
        border: 4px outset rgb(118, 118, 118);
        background-color: rgb(239, 239, 239);
        font-size: 0.9em;
        font-weight: 500;
        line-height: 1em;
        user-select: none;
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

    .pressed {
        border-style: inset;
    }
</style>
