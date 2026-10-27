import { clamp, doNothing, drop, entries, evolve, filter, findIndex, first, flatMap, forEach, hasAtLeast } from 'remeda';
import { identity, isEmpty, isStrictEqual, last, map, merge, pipe, piped, range, set, sortBy, splice, take } from 'remeda';
import type { Updater, Writable } from 'svelte/store';
import * as v from 'valibot';
import { CONDUITE, presets } from '../data/cues';
import { grouped, nextId, numbered, sheetSchema, stored } from '../utils/commands';
import type { Cell, Cue } from '../utils/commands';
import { robot } from './robot.svelte';

/// The storage key of the saved document. A change to the document's shape must change it, so that
/// documents stored in the old shape are ignored.
const KEY = 'cueSheet.v2';

/// The stored document: the sheet, as `stored` writes it.
const documentSchema = v.strictObject({ sheet: sheetSchema });

/// The strip's instruments: Fire plays the sheet, the others edit it.
export const INSTRUMENTS = ['Fire', 'Move', 'Rename', 'Group', 'Ungroup'] as const;

/// Runs `_act`, or gives `_fallback` when it throws. Storage can be missing, full or forbidden,
/// and the sheet must keep working in memory in every case.
const attempt = <T>(_act: () => T, _fallback: T) => {
    try {
        return _act();
    } catch {
        return _fallback;
    }
};

/// The state of a sheet that plays `_cells` from the first one, under `_instrument`. The parameter
/// admits every instrument, so that `choose` can replace the one it starts on.
const playing = (_cells: Cell[], _instrument: (typeof INSTRUMENTS)[number] = 'Fire') => ({
    saved: _cells, // the sheet Save last stored
    cells: _cells, // the cells shown; equal to `saved` under Fire
    pointer: 0,
    pressed: null as number | null,
    instrument: _instrument,
    renaming: null as number | null,
});

/// The cells from `_a` to `_b` as the lowest and the highest index: the only place a sweep's
/// direction is dropped.
const span = (_a: number, _b: number) => sortBy([_a, _b], identity());

/// The indices of the cells from `_a` to `_b`, in either order.
const covered = (_a: number, _b: number) => pipe(span(_a, _b), ([_lo, _hi]) => range(_lo, _hi + 1));

/// `_index` moved onto the first or the last of `_cells` when it falls outside them.
const within = (_cells: Cell[], _index: number) => clamp(_index, { min: 0, max: _cells.length - 1 });

/// `_items` with the item at `_from` moved to position `_to`.
const move = (_from: number, _to: number) => <T>(_items: T[]) =>
    pipe(_items, splice<T>(_from, 1, []), splice(_to, 0, [_items[_from]]));

/// The cue sheet the operator steps through, sending cues and toggles to a robot. Under Fire it
/// plays the saved cells; under the other instruments the operator edits the shown cells, which
/// Save makes the saved sheet and writes to storage. Indices name drawn cells: the strip hands
/// over no other.
export class CueSheet implements Pick<Writable<ReturnType<typeof playing>>, 'update'> {
    #robot: typeof robot;
    #storage: Pick<Storage, 'getItem' | 'setItem'>;
    state: ReturnType<typeof playing>;

    /// Starts on the sheet last saved to `_storage`, or on `_cues`, numbered from 0, when it holds
    /// no valid document.
    constructor(_cues: Cue[], _robot: typeof robot, _storage: Pick<Storage, 'getItem' | 'setItem'>) {
        this.#robot = _robot;
        this.#storage = _storage;
        const read = v.safeParse(documentSchema, attempt(() => JSON.parse(_storage.getItem(KEY) ?? 'null'), null));
        this.state = $state.raw(playing(read.success ? read.output.sheet : numbered(_cues, 0)));
    }

    /// An arrow function, so a caller may pass it detached from the object, as `Writable` allows.
    update = (_change: Updater<CueSheet['state']>) => {
        this.state = _change(this.state);
    };

    /// What a sweep from cell `a` to cell `b` does under each instrument: the cells shown and the
    /// cells highlighted while the pointer is down, and the effect on release. Fire highlights nothing. Move shows the cells as its release will leave them, and highlights
    /// only the moved cell, which follows the pointer.
    instruments: Record<
        CueSheet['state']['instrument'],
        {
            shown: (_a: number, _b: number) => (_cells: Cell[]) => Cell[];
            swept: (_a: number, _b: number) => number[];
            release: (_a: number, _b: number) => void;
        }
    > = {
        Fire: { shown: () => identity(), swept: () => [], release: (_a, _b) => this.send(_b) },
        Move: { shown: move, swept: (_a, _b) => [_b], release: (_a, _b) => this.reorder(_a, _b) },
        Rename: { shown: () => identity(), swept: covered, release: (_a, _b) => this.startRenaming(_b) },
        Group: { shown: () => identity(), swept: covered, release: (_a, _b) => this.group(_a, _b) },
        Ungroup: { shown: () => identity(), swept: covered, release: (_a, _b) => this.ungroup(_a, _b) },
    };

    /// Applies the sweep from cell `_a` to cell `_b` with the active instrument.
    sweep = (_a: number, _b: number) => this.instruments[this.state.instrument].release(_a, _b);

    /// Replaces the state by `_change` of it, and ends any renaming.
    #edit = (_change: Updater<CueSheet['state']>) => this.update(piped(_change, set('renaming', null)));

    /// Makes `_instrument` the active one, and ends any renaming. Edit is `choose('Move')`.
    choose = (_instrument: CueSheet['state']['instrument']) => this.#edit(set('instrument', _instrument));

    /// Makes the label of cell `_index` editable.
    startRenaming = (_index: number) => this.update(set('renaming', _index));

    /// Ends any renaming and keeps the label.
    stopRenaming = () => this.update(set('renaming', null));

    /// Replaces the cells from `_a` to `_b`, in either order, by `_change` of them and of all the shown
    /// cells, and ends any renaming. A pointer on a replaced cell lands on the first new one; a pointer after them
    /// keeps its cell.
    #replace = (_a: number, _b: number, _change: (_run: Cell[], _cells: Cell[]) => Cell[]) => {
        const [lo, hi] = span(_a, _b);
        const count = hi - lo + 1;
        this.#edit((_state) => {
            const made = _change(pipe(_state.cells, drop(lo), take(count)), _state.cells);
            return evolve(_state, {
                cells: splice(lo, count, made),
                pointer: (_at) => (_at > hi ? _at + made.length - count : clamp(_at, { max: lo })),
            });
        });
    };

    /// Gives cell `_index` the label `_label`, and ends any renaming.
    rename = (_index: number, _label: string) => this.#replace(_index, _index, map(set('label', _label)));

    /// Replaces the cells from `_a` to `_b` by one group of them, labelled with its first and last
    /// labels, under an identifier no shown cell holds. A range of one cell stays as it is.
    group = (_a: number, _b: number) =>
        this.#replace(_a, _b, (_run, _cells) =>
            hasAtLeast(_run, 2) ? [grouped(nextId(_cells), `${first(_run).label} → ${last(_run).label}`, _run)] : _run,
        );

    /// Replaces every cell from `_a` to `_b` by its constituents; a cell without any stays as it is.
    ungroup = (_a: number, _b: number) =>
        this.#replace(_a, _b, flatMap((_cell) => (isEmpty(_cell.items) ? [_cell] : _cell.items)));

    /// Moves cell `_from` to position `_to`, and ends any renaming. The pointer keeps its cell: the
    /// same move, applied to the indices, says where each cell lands.
    reorder = (_from: number, _to: number) =>
        this.#edit((_state) =>
            merge(_state, {
                cells: move(_from, _to)(_state.cells),
                pointer: pipe(range(0, _state.cells.length), move(_from, _to), findIndex(isStrictEqual(_state.pointer))),
            }),
        );

    /// Shows the saved cells again, keeps the instrument, and ends any renaming. The pointer keeps
    /// its index, moved onto the last cell when the saved cells are fewer.
    reset = () =>
        this.#edit((_state) => merge(_state, { cells: _state.saved, pointer: within(_state.saved, _state.pointer) }));

    /// Discards the edits and returns to play mode.
    cancel = () => {
        this.reset();
        this.choose('Fire');
    };

    /// Makes the shown cells the saved sheet, writes it to storage, and returns to play mode with
    /// no cell pressed.
    save = () => {
        attempt(() => this.#storage.setItem(KEY, JSON.stringify({ sheet: pipe(this.state.cells, map(stored)) })), undefined);
        this.update((_state) => merge(_state, { saved: _state.cells, pressed: null }));
        this.choose('Fire');
    };

    /// Moves the pointer by `_steps`, and keeps it on the first and the last cell.
    move = (_steps: number) =>
        this.update((_state) => evolve(_state, { pointer: (_at) => within(_state.cells, _at + _steps) }));

    /// Sends the cue of cell `_index`.
    send = (_index: number) => void this.#robot.request(this.state.cells[_index]);

    /// Sends the cue under the pointer, draws it pressed, then moves the pointer by `_steps`.
    fire = (_steps: number) => {
        this.send(this.state.pointer);
        this.update((_state) => set(_state, 'pressed', _state.pointer));
        this.move(_steps);
    };

    /// `_act`, run only under Fire: the keys that fire and move do nothing while the sheet is edited.
    #playing = (_act: () => void) => () => this.state.instrument === 'Fire' && _act();

    /// Ends the pressed drawing of the cell a released key fired.
    #unpress = () => this.update(set('pressed', null));

    /// What each key does when pressed and when released. `label` names it for the operator.
    keyBindings = {
        ArrowRight: { label: 'Fire, then next cue', press: this.#playing(() => this.fire(1)), release: this.#unpress },
        ArrowLeft: { label: 'Fire, then previous cue', press: this.#playing(() => this.fire(-1)), release: this.#unpress },
        ArrowDown: { label: 'Next cue', press: this.#playing(() => this.move(1)), release: doNothing() },
        ArrowUp: { label: 'Previous cue', press: this.#playing(() => this.move(-1)), release: doNothing() },
        Enter: { label: 'Fire', press: this.#playing(() => this.fire(0)), release: this.#unpress },
        a: { label: 'Toggle Pose', press: () => this.#robot.togglePosture('Pose'), release: doNothing() },
        b: { label: 'Toggle Leaping', press: () => this.#robot.toggleGait('Leaping'), release: doNothing() },
        x: { label: 'Toggle Sit', press: () => this.#robot.togglePosture('Sitting'), release: doNothing() },
        y: { label: 'Dance', press: () => void this.#robot.request(presets.dance), release: doNothing() },
    };

    /// Every key starts on its binding in `keyBindings`; writing `bindings` rebinds a key while the
    /// app runs, to any binding the table holds.
    bindings = $state.raw<Record<keyof CueSheet['keyBindings'], CueSheet['keyBindings']['a']>>(this.keyBindings);

    /// Runs the `_phase` of the binding of `_key`. An unbound key matches no binding.
    #run = (_phase: Exclude<keyof CueSheet['keyBindings']['a'], 'label'>) => (_key: string) =>
        pipe(this.bindings, entries(), filter(([_bound]) => _bound === _key), forEach(([, _binding]) => _binding[_phase]()));

    press = this.#run('press');
    release = this.#run('release');
}

/// The app's cue sheet, the show's running order or the sheet last saved in the browser, sent to
/// the app's robot. Storage is read only when called, inside `attempt`, because a browser that
/// blocks site data throws on reading `localStorage`.
export const cueSheet = new CueSheet(CONDUITE, robot, {
    getItem: (_key) => globalThis.localStorage.getItem(_key),
    setItem: (_key, _value) => globalThis.localStorage.setItem(_key, _value),
});
