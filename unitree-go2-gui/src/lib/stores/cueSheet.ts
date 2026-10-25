import { addProp, clamp, doNothing, entries, evolve, flatMap, isArray, isEmpty, isIncludedIn } from 'remeda';
import { isPlainObject, isString, mapValues, range, set, splice } from 'remeda';
import { derived, get, writable } from 'svelte/store';
import { CONDUITE, presets } from '../data/cues';
import { sequence } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { robot } from './robot';

/// The storage key of the saved sheet. A change to the shape of `Cue` must change it, so that
/// sheets stored in the old shape are ignored.
const KEY = 'cueSheet.v1';

/// A stored value is taken for a cue when it has a string label and arrays of steps, changes and
/// constituents, the constituents being cues in turn. The steps and changes are not inspected.
const isCue = (_value: unknown): _value is Cue =>
    isPlainObject(_value) &&
    isString(_value.label) &&
    [_value.steps, _value.changes].every(isArray) &&
    isArray(_value.items) &&
    _value.items.every(isCue);

/// A stored value is taken for a sheet when it is a non-empty list of cues.
const isSheet = (_value: unknown): _value is Cue[] => isArray(_value) && !isEmpty(_value) && _value.every(isCue);

/// Runs `_act`, or gives `_fallback` when it throws. Storage can be missing, full or forbidden,
/// and the sheet must keep working in memory in every case.
const attempt = <T>(_act: () => T, _fallback: T) => {
    try {
        return _act();
    } catch {
        return _fallback;
    }
};

/// `_act` while `_available` holds, and `null` otherwise, which the strip draws as a disabled action.
const offer = (_available: boolean, _act: () => void) => (_available ? _act : null);

/// Creates the cue sheet the operator steps through. It sends cues and toggles to `_robot`.
/// In play mode the sheet fires its saved cells; in edit mode the operator changes a draft of them,
/// which Save makes the saved sheet and writes to `_storage`.
export const createCueSheet = (
    _cues: typeof CONDUITE,
    _robot: typeof robot,
    _storage: Pick<Storage, 'getItem' | 'setItem'>,
) => {
    /// The cells play mode fires: the sheet last saved to `_storage`, or `_cues` when it holds none.
    const sheet = writable(
        attempt(() => [JSON.parse(_storage.getItem(KEY) ?? 'null')].find(isSheet) ?? _cues, _cues),
    );
    const pointer = writable(0);
    const pressed = writable<number | null>(null);

    /// What a click on a cell does with each edit tool, and the cursor over the strip that shows it.
    /// A Select click selects the cell; a shift-click also selects every cell from the selection to it.
    const tools = {
        Select: {
            cursor: 'default',
            click: (_index: number, _shift: boolean) =>
                edit(_index)((_draft) => {
                    const ends = [_index, ...(_shift ? _draft.selection : [])];
                    return set(_draft, 'selection', range(Math.min(...ends), Math.max(...ends) + 1));
                }),
        },
        Rename: { cursor: 'text', click: (_index: number) => edit(_index)(set('renaming', _index)) },
    };

    /// A draft of `_cells` with its pointer at `_pointer`, under the Select tool, with nothing
    /// selected and no label being renamed.
    const begin = (_cells: Cue[], _pointer: number) => ({
        cells: _cells,
        pointer: _pointer,
        selection: [] as number[],
        tool: 'Select' as keyof typeof tools,
        renaming: null as number | null,
    });
    type Draft = ReturnType<typeof begin>;
    /// The cells edit mode changes; `null` in play mode.
    const draft = writable<Draft | null>(null);

    /// In edit mode, replaces the draft by `_change` of it when each of `_indices` names one of its cells.
    const edit = (..._indices: number[]) => (_change: (_draft: Draft) => Draft) =>
        draft.update((_draft) =>
            _draft !== null && _indices.every(isIncludedIn(range(0, _draft.cells.length))) ? _change(_draft) : _draft,
        );

    /// Replaces cells `_lo` to `_hi` by `_cells`, selects them, and ends any renaming. A pointer
    /// on a replaced cell lands on the first new one; a pointer after them keeps its cell.
    const replace = (_lo: number, _hi: number, _cells: Cue[]) => (_draft: Draft) =>
        evolve(_draft, {
            cells: splice(_lo, _hi - _lo + 1, _cells),
            pointer: (_at) => (_at > _hi ? _at + _cells.length - (_hi - _lo + 1) : Math.min(_at, _lo)),
            selection: () => range(_lo, _lo + _cells.length),
            renaming: () => null,
        });

    /// Moves cell `_from` to position `_to`, selects it there, and ends any renaming. The cells and
    /// the pointer go through the same permutation, so the pointer keeps its cell.
    const reorder = (_from: number, _to: number) => (_draft: Draft) => {
        const order = splice(splice(range(0, _draft.cells.length), _from, 1, []), _to, 0, [_from]);
        return evolve(_draft, {
            cells: (_cells) => order.map((_index) => _cells[_index]),
            pointer: (_at) => order.indexOf(_at),
            selection: () => [_to],
            renaming: () => null,
        });
    };

    /// What the cue strip draws and what its controls call, in the current mode and tool. The keys
    /// that fire and move call `fire` and `move`, which do nothing in edit mode.
    const strip = derived([sheet, pointer, pressed, draft], ([_sheet, _pointer, _pressed, _draft]) => {
        const start = () => draft.set(begin(_sheet, _pointer));
        const send = (_index: number) => void _robot.request(_sheet[_index]);
        const move = (_steps: number) => pointer.set(clamp(_pointer + _steps, { min: 0, max: _sheet.length - 1 }));
        if (_draft === null)
            return {
                cells: _sheet,
                pointer: _pointer,
                pressed: _pressed,
                selection: [],
                renaming: null,
                click: send,
                cursor: 'pointer',
                draggable: false,
                tools: null,
                actions: null,
                transitions: { Edit: start },
                /// Sends the cue under the pointer, draws it pressed, then moves the pointer by `_steps`.
                fire: (_steps: number) => {
                    pressed.set(_pointer);
                    send(_pointer);
                    move(_steps);
                },
                move,
            };
        const { cells, selection } = _draft;
        const [lo, hi] = [Math.min(...selection), Math.max(...selection)];
        const selected = cells.slice(lo, hi + 1);
        return {
            cells,
            pointer: _draft.pointer,
            pressed: null,
            selection,
            renaming: _draft.renaming,
            click: tools[_draft.tool].click,
            cursor: tools[_draft.tool].cursor,
            draggable: true,
            tools: addProp(
                mapValues(tools, (_tool, _name) => () => edit()(evolve({ tool: () => _name, renaming: () => null }))),
                'active',
                _draft.tool,
            ),
            /// Group replaces the selection by one sequence of it; Ungroup replaces each selected
            /// group by its constituents.
            actions: {
                group: offer(selected.length >= 2, () => {
                    const label = `${cells[lo].label} → ${cells[hi].label}`;
                    edit()(replace(lo, hi, [sequence(label, cells[lo], ...selected.slice(1))]));
                }),
                ungroup: offer(selected.some((_cell) => !isEmpty(_cell.items)), () => {
                    const parts = flatMap(selected, (_cell) => (isEmpty(_cell.items) ? [_cell] : _cell.items));
                    edit()(replace(lo, hi, parts));
                }),
            },
            transitions: {
                Save: () => {
                    sheet.set(cells);
                    attempt(() => _storage.setItem(KEY, JSON.stringify(cells)), undefined);
                    pointer.set(_draft.pointer);
                    pressed.set(null);
                    draft.set(null);
                },
                Reset: start,
                Cancel: () => draft.set(null),
            },
            fire: doNothing(),
            move: doNothing(),
        };
    });

    /// Releasing a key that fires a cue ends that cue's pressed drawing; other keys do nothing.
    const unpress = () => pressed.set(null);
    /// What each key does when pressed and when released. `label` names it for the operator.
    const keyBindings = {
        ArrowRight: { label: 'Fire, then next cue', press: () => get(strip).fire(1), release: unpress },
        ArrowLeft: { label: 'Fire, then previous cue', press: () => get(strip).fire(-1), release: unpress },
        ArrowDown: { label: 'Next cue', press: () => get(strip).move(1), release: doNothing() },
        ArrowUp: { label: 'Previous cue', press: () => get(strip).move(-1), release: doNothing() },
        Enter: { label: 'Fire', press: () => get(strip).fire(0), release: unpress },
        a: { label: 'Toggle Pose', press: () => _robot.togglePosture('Pose'), release: doNothing() },
        b: { label: 'Toggle Leaping', press: () => _robot.toggleGait('Leaping'), release: doNothing() },
        x: { label: 'Toggle Sit', press: () => _robot.togglePosture('Sitting'), release: doNothing() },
        y: { label: 'Dance', press: () => void _robot.request(presets.dance), release: doNothing() },
    };
    /// Every key starts on its binding in `keyBindings`; writing this store rebinds a key while the
    /// app runs, to any binding the table holds.
    const bindings = writable<Record<keyof typeof keyBindings, (typeof keyBindings)[keyof typeof keyBindings]>>(
        keyBindings,
    );

    /// Runs the `_phase` of the binding of `_key` in `bindings`. An unbound key matches no binding.
    const run = (_phase: 'press' | 'release') => (_key: string) =>
        entries(get(bindings))
            .filter(([_bound]) => _bound === _key)
            .forEach(([, _binding]) => _binding[_phase]());

    return {
        strip,
        bindings,
        /// Gives cell `_index` the label `_label`, and ends any renaming.
        rename: (_index: number, _label: string) =>
            edit(_index)((_draft) => {
                const renamed = set(_draft.cells[_index], 'label', _label);
                return evolve(_draft, { cells: splice(_index, 1, [renamed]), renaming: () => null });
            }),
        /// Ends any renaming and keeps the label.
        stopRenaming: () => edit()(set('renaming', null)),
        reorder: (_from: number, _to: number) => edit(_from, _to)(reorder(_from, _to)),
        press: run('press'),
        release: run('release'),
    };
};

/// The app's cue sheet, the show's running order or the sheet last saved in the browser, sent to
/// the app's robot. Storage is read only when called, inside `attempt`, because a browser that
/// blocks site data throws on reading `localStorage`.
export const cueSheet = createCueSheet(CONDUITE, robot, {
    getItem: (_key) => globalThis.localStorage.getItem(_key),
    setItem: (_key, _value) => globalThis.localStorage.setItem(_key, _value),
});
