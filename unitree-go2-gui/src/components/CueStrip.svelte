<script lang="ts">
    import { clamp, concat, evolve, flatMap, forEach, isEmpty, isIncludedIn, last, map, pipe, reduce } from 'remeda';
    import { cueSheet, SHEET_TOOLS } from '../lib/stores/cueSheet.svelte';
    import { commandsOf } from '../lib/utils/commands';
    import { covered } from '../lib/utils/lists';
    import type { Cell, Cue } from '../lib/utils/commands';
    import type { LucideIcon } from '@lucide/svelte';
    import Move from '@lucide/svelte/icons/move';
    import Pencil from '@lucide/svelte/icons/pencil';
    import Group from '@lucide/svelte/icons/group';
    import Ungroup from '@lucide/svelte/icons/ungroup';
    import Timer from '@lucide/svelte/icons/timer';
    import Trash from '@lucide/svelte/icons/trash';

    /// The icon of each sheet tool; a tool without an icon fails the type check.
    const ICONS = { Move, Rename: Pencil, Group, Ungroup, Pause: Timer, Delete: Trash } satisfies Record<(typeof SHEET_TOOLS)[number], LucideIcon>;

    /// The strip's root element, whose drawn cells give each cell its index.
    let strip: HTMLDivElement;

    /// The sweep in progress, as the cell `a` the press started on, the cell `b` under the pointer,
    /// the press's horizontal position `x`, and the press as the store reads it; empty while no
    /// button is pressed on a cell. While a pane command is held, the sweep starts on the first cell
    /// the pointer moves over. A release on a cell completes the sweep; a release anywhere else
    /// only ends it.
    let sweeps: { a: number; b: number; x: number; press: NonNullable<Parameters<typeof cueSheet.sweep>[2]> }[] = $state([]);

    /// The entry of the store's instruments in use, and the cells it shows and highlights during
    /// the sweep in progress.
    let instrument = $derived(cueSheet.instruments[cueSheet.inUse()]);
    let shown = $derived(reduce(sweeps, (_cells: Cell[], { a, b, press }) => instrument.shown(a, b, press)(_cells), cueSheet.state.shown.sheet));
    /// The cells awaiting deletion stay highlighted after the sweep that chose them.
    let deleting = $derived(cueSheet.state.deleting);
    let swept = $derived(concat(flatMap(sweeps, ({ a, b, press }) => instrument.swept(a, b, press)), deleting ? covered(...deleting) : []));

    /// The row that confirms a deletion, the point where the last sweep ended on a cell, and the
    /// row's position: that point, moved just enough for the open row to fit inside the window. The
    /// row is a popover, so the scrolled strip does not clip it, and it is open exactly while cells
    /// await deletion. Escape and a press outside the row end the confirmation.
    let confirmation: HTMLDivElement;
    let released = $state({ x: 0, y: 0 });
    let place = $state({ left: 0, top: 0 });
    $effect(() => {
        confirmation.togglePopover(deleting !== null);
        const { width, height } = confirmation.getBoundingClientRect();
        place = { left: clamp(released.x, { min: 0, max: innerWidth - width }), top: clamp(released.y, { min: 0, max: innerHeight - height }) };
    });

    /// The index of the cell `_event` targets, as zero or one index: the cell's position among the
    /// drawn cells. None outside every cell, and none inside the label being renamed, so a press
    /// there places the caret.
    const cellAt = ({ target }: Event) => {
        const cell = target instanceof HTMLElement && !target.isContentEditable && target.closest('[data-index]');
        return flatMap([...strip.querySelectorAll('[data-index]')], (_cell, _index) => (_cell === cell ? [_index] : []));
    };

    /// The sweep starting at the cell `_event` targets, as zero or one.
    const started = (_event: PointerEvent) =>
        map(cellAt(_event), (_index) => ({ a: _index, b: _index, x: _event.clientX, press: { after: onLowerHalf(_event, _index), travel: 0, drag: 0 } }));

    /// Whether `_event` falls on the lower half of the drawn cell `_index`.
    const onLowerHalf = (_event: PointerEvent, _index: number) =>
        pipe(strip.querySelectorAll('[data-index]')[_index].getBoundingClientRect(), ({ top, height }) => _event.clientY > top + height / 2);

    /// How far `_event` lies from `_x` toward the strip's right edge, as a fraction of that distance
    /// from 0 to 1.
    const travel = (_event: PointerEvent, _x: number) =>
        clamp((_event.clientX - _x) / (strip.getBoundingClientRect().right - _x), { min: 0, max: 1 });

    /// How far `_event` lies right of `_x`, negative when left of it, as a fraction of the strip's width.
    const drag = (_event: PointerEvent, _x: number) => (_event.clientX - _x) / strip.getBoundingClientRect().width;

    /// The number of robot commands a group cell sends, counting its nested groups and not its
    /// waits; 0 for a cell that is not a group, so only a group shows a count.
    const commandCount = (_cell: Cue) => (_cell.items === undefined ? 0 : commandsOf(_cell).length);

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

<svelte:window
    onpointerup={() => {
        sweeps = [];
        cueSheet.drop();
    }}
    onpointerdown={(event) => deleting !== null && event.target instanceof Node && !confirmation.contains(event.target) && cueSheet.cancelDelete()}
    onkeydown={(event) => deleting !== null && event.key === 'Escape' && cueSheet.cancelDelete()}
/>

<div
    id="sidebar"
    class="actionsequence"
    data-instrument={cueSheet.inUse()}
    bind:this={strip}
    onpointerdown={(event) => (sweeps = started(event))}
    onpointermove={(event) =>
        (sweeps = map(isEmpty(sweeps) && cueSheet.state.carried !== null ? started(event) : sweeps, (_sweep) =>
            evolve(_sweep, { b: (_b) => last([_b, ...cellAt(event)]), press: { travel: () => travel(event, _sweep.x), drag: () => drag(event, _sweep.x) } }),
        ))}
    onpointerup={(event) =>
        forEach(sweeps, ({ a, press }) =>
            forEach(cellAt(event), (_b) => {
                released = { x: event.clientX, y: event.clientY };
                cueSheet.sweep(a, _b, press);
            }),
        )}
>
    {#if cueSheet.state.instrument !== 'Fire'}
        <div class="bar button-row">
            {#each SHEET_TOOLS as name}
                {@const Icon = ICONS[name]}
                <button class:active={cueSheet.state.instrument === name} title={name} aria-label={name} onclick={() => cueSheet.choose(name)}><Icon size="1em" /></button>
            {/each}
        </div>
    {/if}
    {#each shown as cell, i}
        <div class="cell" data-index={i} class:active-step={cell === cueSheet.state.shown.sheet[cueSheet.state.pointer]} class:pressed={cueSheet.isPressed(cell)}
            class:swept={isIncludedIn(i, swept) || cueSheet.isTarget(cell)}>
            {#if cueSheet.state.renaming === i}
                <span contenteditable="plaintext-only" use:editor={i}>{cell.label}</span>
            {:else}
                <span>{cell.label}</span>
            {/if}
            {#if commandCount(cell) > 1}
                <span>({commandCount(cell)})</span>
            {/if}
        </div>
    {/each}
    <div class="confirmation button-row" popover="manual" bind:this={confirmation} style:left="{place.left}px" style:top="{place.top}px">
        <button disabled={cueSheet.deletesAll()} title={cueSheet.deletesAll() ? 'The sheet must keep at least one cell' : undefined} onclick={cueSheet.confirmDelete}>Confirm</button>
        <button onclick={cueSheet.cancelDelete}>Cancel</button>
    </div>
</div>

<style>
    /* The width fits the tool buttons of the top bar on one line, and does not change between
       modes or with the labels. It adds the sidebar's 1em padding on each side, because the
       padding sits inside the width. No text is selected during a sweep; Safari needs the prefixed
       property. Safari bounces a scroll container at either end of its range, and the bounce moves
       the sticky bar with the cells; overscroll-behavior turns the bounce off. */
    .actionsequence {
        -webkit-user-select: none;
        user-select: none;
        width: calc(19rem + 2em);
        display: flex;
        flex-direction: column;
        max-height: 100%;
        overflow-y: auto;
        overscroll-behavior-y: none;
    }

    /* The bar stays at the top of the scrolled strip; cells scroll under it. A sticky element stops
       at the inner edge of the sidebar's padding, so the bar extends over the 1em top padding and
       stops at the strip's top edge; otherwise cells would show above it. */
    .bar {
        position: sticky;
        top: -1em;
        margin-top: -1em;
        padding-top: 1em;
        z-index: 1;
        background: rgb(230, 230, 230);
    }

    .bar button {
        flex: 1 1 auto;
    }

    /* `:where` keeps this below the .button-row dividers, so an active tool keeps its grooved edges. */
    .bar :where(.active) {
        border-style: inset;
        background-color: var(--inset-background);
    }

    /* A cell is drawn as the app's buttons are. A long label wraps inside its cell. The label sits
       flush left and the command count flush right; the gap separates them, since a flex container
       drops the space. */
    .cell {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1ch;
        min-height: 3em;
        padding: 0.6em;
        border: 4px outset var(--bevel-color);
        background-color: rgb(239, 239, 239);
        font-size: 0.9em;
        font-weight: 500;
        line-height: 1em;
        overflow-wrap: anywhere;
    }

    [contenteditable] {
        -webkit-user-select: text;
        user-select: text;
    }

    .active-step {
        font-weight: bold;
        box-shadow: inset 0 0 10px rgb(0, 218, 163);
        border-color: rgb(0, 218, 163);
    }

    /* A cell or a pane button fired by a key, or a cell held under the pointer in play mode, looks
       pressed. This rule comes before the swept one, so a pressed cell that is also swept keeps the
       swept background. */
    .pressed,
    :global(button.pressed),
    :global(.pressed > button),
    [data-instrument='Fire'] .cell:active {
        border-style: inset;
        background-color: var(--inset-background);
    }

    /* A swept cell, and under Assign the cell or the pane button the selected key is linked to.
       The pane's buttons share the look through the global selectors; a pane button may sit
       inside the highlighted element. */
    .swept,
    :global(button.swept),
    :global(.swept > button) {
        background: rgb(170, 200, 240);
    }

    /* The cursor shows the active instrument; Move shows a closed hand while a cell is held. */
    [data-instrument='Fire'],
    [data-instrument='Ungroup'] {
        cursor: pointer;
    }

    [data-instrument='Move'] {
        cursor: grab;
    }

    [data-instrument='Move']:has(.cell:active) {
        cursor: grabbing;
    }

    [data-instrument='Rename'] {
        cursor: text;
    }

    [data-instrument='Group'] {
        cursor: cell;
    }

    /* Under Pause, dragging right lengthens the wait. */
    [data-instrument='Pause'] {
        cursor: ew-resize;
    }

    /* Under Delete, the swept cells are marked for deletion. */
    [data-instrument='Delete'] {
        cursor: crosshair;
    }

    /* While a pane command is held, the strip receives a copy of it. */
    [data-instrument='Copy'] {
        cursor: copy;
    }

    /* The confirmation row sits where `place` puts its top left corner, instead of the browser's
       centring of a popover. */
    .confirmation {
        inset: auto;
        margin: 0;
        padding: 0;
        border: none;
        background: none;
    }

    /* Two stacked cells are divided by one grooved line: the upper cell's bottom edge. The divider
       belongs to both cells, so a pressed cell draws inset only on its other edges. These rules come
       last and are scoped to the strip, so that they win over the pressed ones. */
    .actionsequence .cell + .cell {
        border-top: none;
    }

    .actionsequence .cell:has(+ .cell) {
        border-bottom-style: groove;
    }
</style>
