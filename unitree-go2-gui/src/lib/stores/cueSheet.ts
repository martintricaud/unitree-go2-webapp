import { clamp, first, isIncludedIn, isPlainObject, isString, keys, mapValues, range, sort, splice, unique } from 'remeda';
import { derived, get, readonly, writable } from 'svelte/store';
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
    Array.isArray(_value.steps) &&
    Array.isArray(_value.changes) &&
    Array.isArray(_value.items) &&
    _value.items.every(isCue);

/// Runs `_act`, or gives `_fallback` when it throws. Storage can be missing, full or forbidden,
/// and the sheet must keep working in memory in every case.
const attempt = <T>(_act: () => T, _fallback: T) => {
    try {
        return _act();
    } catch {
        return _fallback;
    }
};

/// Creates the cue sheet the operator steps through. It sends cues and toggles to `_robot`.
/// In play mode the sheet fires its saved cells; in edit mode the operator changes a draft of them,
/// which Save makes the saved sheet and writes to `_storage`.
export const createCueSheet = (
    _cues: typeof CONDUITE,
    _robot: typeof robot,
    _storage: Pick<Storage, 'getItem' | 'setItem'>,
) => {
    /// The cells play mode fires: the sheet last saved to `_storage`, or `_cues` when `_storage`
    /// holds no non-empty list of cues.
    const sheet = writable<Cue[]>(
        attempt(() => {
            const stored: unknown = JSON.parse(_storage.getItem(KEY) ?? 'null');
            return Array.isArray(stored) && stored.length > 0 && stored.every(isCue) ? stored : _cues;
        }, _cues),
    );
    const pointer = writable(0);
    const pressed = writable<number | null>(null);

    /// Sends the cue at `_index`, and leaves the pointer and the pressed cue as they are.
    const send = (_index: number) => void _robot.request(get(sheet)[_index]);

    /// What a click on a cell does with each edit tool, and the cursor over the strip that shows it.
    const tools = {
        Select: { cursor: 'default', click: (_index: number, _shift: boolean) => (_shift ? extend : select)(_index) },
        Rename: {
            cursor: 'text',
            click: (_index: number) => edit(_index)((_draft) => ({ ..._draft, renaming: _index })),
        },
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

    /// Replaces the draft by `_change` of it when every index in `_indices` names one of its cells.
    /// Does nothing in play mode.
    const edit =
        (..._indices: number[]) =>
        (_change: (_draft: Draft) => Draft) =>
            draft.update((_draft) =>
                _draft !== null && _indices.every(isIncludedIn(range(0, _draft.cells.length)))
                    ? _change(_draft)
                    : _draft,
            );

    /// Gives cell `_index` the label `_label`, and ends any renaming.
    const rename = (_index: number, _label: string) =>
        edit(_index)((_draft) => ({
            ..._draft,
            cells: splice(_draft.cells, _index, 1, [{ ..._draft.cells[_index], label: _label }]),
            renaming: null,
        }));

    /// Ends any renaming and keeps the label.
    const stopRenaming = () => edit()((_draft) => ({ ..._draft, renaming: null }));

    /// Replaces cell `_index` of a draft by its constituents, in order, selects them, and ends any
    /// renaming. A draft whose cell `_index` has no constituents stays as it is.
    const splitAt = (_index: number) => (_draft: Draft) => {
        const { items } = _draft.cells[_index];
        return items.length === 0
            ? _draft
            : {
                  ..._draft,
                  cells: splice(_draft.cells, _index, 1, items),
                  pointer: _draft.pointer > _index ? _draft.pointer + items.length - 1 : _draft.pointer,
                  selection: range(_index, _index + items.length),
                  renaming: null,
              };
    };

    /// Replaces cell `_index` by its constituents, in order, and selects them. A cell without
    /// constituents stays as it is.
    const split = (_index: number) => edit(_index)(splitAt(_index));

    /// The selected cells that have constituents.
    const groups = (_draft: Draft) => _draft.selection.filter((_index) => _draft.cells[_index].items.length > 0);

    /// Splits every selected cell that has constituents, in one change of the draft, and selects the
    /// run the selection covered, grown by the cells the splits added. The splits run from the
    /// highest index to the lowest, so each one leaves the indices of the cells before it valid.
    const ungroup = () =>
        edit()((_draft) => {
            const ungrouped = sort(groups(_draft), (_a, _b) => _b - _a).reduce(
                (_split, _index) => splitAt(_index)(_split),
                _draft,
            );
            const [lo, hi] = [Math.min(..._draft.selection), Math.max(..._draft.selection)];
            return { ...ungrouped, selection: range(lo, hi + 1 + ungrouped.cells.length - _draft.cells.length) };
        });

    /// Replaces the cells from `_from` to `_to`, in either order, by one sequence of them labelled
    /// with the first and the last label, and selects it.
    const merge = (_from: number, _to: number) =>
        edit(_from, _to)((_draft) => {
            const [lo, hi] = [Math.min(_from, _to), Math.max(_from, _to)];
            const label = `${_draft.cells[lo].label} → ${_draft.cells[hi].label}`;
            return lo === hi
                ? _draft
                : {
                      ..._draft,
                      cells: splice(_draft.cells, lo, hi - lo + 1, [
                          sequence(label, _draft.cells[lo], ..._draft.cells.slice(lo + 1, hi + 1)),
                      ]),
                      // A pointer inside the merged cells lands on the sequence; one after them
                      // moves up by the cells the sequence absorbed.
                      pointer: _draft.pointer - clamp(_draft.pointer - lo, { min: 0, max: hi - lo }),
                      selection: [lo],
                      renaming: null,
                  };
        });

    /// Moves cell `_from` to position `_to`, and selects it there. The cells between the two
    /// positions shift by one toward `_from`.
    const reorder = (_from: number, _to: number) =>
        edit(_from, _to)((_draft) => ({
            ..._draft,
            cells: splice(splice(_draft.cells, _from, 1, []), _to, 0, [_draft.cells[_from]]),
            pointer:
                _draft.pointer === _from
                    ? _to
                    : isIncludedIn(_draft.pointer, range(Math.min(_from, _to), Math.max(_from, _to) + 1))
                      ? _draft.pointer + Math.sign(_from - _to)
                      : _draft.pointer,
            selection: [_to],
            renaming: null,
        }));

    /// Selects cell `_index` alone.
    const select = (_index: number) => edit(_index)((_draft) => ({ ..._draft, selection: [_index] }));

    /// Adds every cell from the first selected one to `_index`, both included. On an empty
    /// selection, selects `_index` alone. The selection therefore stays a contiguous run of cells.
    const extend = (_index: number) =>
        edit(_index)((_draft) => {
            const anchor = first(_draft.selection) ?? _index;
            const run = range(Math.min(anchor, _index), Math.max(anchor, _index) + 1);
            return { ..._draft, selection: unique([..._draft.selection, ...run]) };
        });

    /// The pointer stays on a cell of the saved sheet. Does nothing in edit mode.
    const move = (_steps: number) => {
        if (get(draft) !== null) return;
        pointer.update((_at) => clamp(_at + _steps, { min: 0, max: get(sheet).length - 1 }));
    };

    /// Sends the cue under the pointer, draws it pressed, then moves the pointer by `_steps`.
    /// Does nothing in edit mode.
    const fire = (_steps: number) => {
        if (get(draft) !== null) return;
        const at = get(pointer);
        pressed.set(at);
        send(at);
        move(_steps);
    };

    /// What the cue strip draws and what its controls call, in the current mode and tool.
    const strip = derived([sheet, pointer, pressed, draft], ([_sheet, _pointer, _pressed, _draft]) => {
        if (_draft === null)
            return {
                cells: _sheet,
                pointer: _pointer,
                pressed: _pressed,
                selection: [],
                renaming: null,
                click: send,
                cursor: 'default',
                draggable: false,
                tools: null,
                actions: null,
                transitions: { Edit: () => draft.set(begin(_sheet, _pointer)) },
            };
        return {
            cells: _draft.cells,
            pointer: _draft.pointer,
            pressed: null,
            selection: _draft.selection,
            renaming: _draft.renaming,
            ...tools[_draft.tool],
            draggable: true,
            tools: {
                ...mapValues(tools, (_tool, _name) => () => edit()((_d) => ({ ..._d, tool: _name, renaming: null }))),
                active: _draft.tool,
            },
            actions: {
                group:
                    _draft.selection.length >= 2
                        ? () => merge(Math.min(..._draft.selection), Math.max(..._draft.selection))
                        : null,
                ungroup: groups(_draft).length > 0 ? ungroup : null,
            },
            transitions: {
                Save: () => {
                    sheet.set(_draft.cells);
                    attempt(() => _storage.setItem(KEY, JSON.stringify(_draft.cells)), undefined);
                    pointer.set(_draft.pointer);
                    pressed.set(null);
                    draft.set(null);
                },
                Reset: () => draft.set(begin(_sheet, _pointer)),
                Cancel: () => draft.set(null),
            },
        };
    });

    /// Releasing a key that fires a cue ends that cue's pressed drawing; other keys do nothing.
    const unpress = () => pressed.set(null);
    const noop = () => {};
    /// What each key does when pressed and when released. `label` names it for the operator.
    const keyBindings = {
        ArrowRight: { label: 'Fire, then next cue', press: () => fire(1), release: unpress },
        ArrowLeft: { label: 'Fire, then previous cue', press: () => fire(-1), release: unpress },
        ArrowDown: { label: 'Next cue', press: () => move(1), release: noop },
        ArrowUp: { label: 'Previous cue', press: () => move(-1), release: noop },
        Enter: { label: 'Fire', press: () => fire(0), release: unpress },
        a: { label: 'Toggle Pose', press: () => _robot.togglePosture('Pose'), release: noop },
        b: { label: 'Toggle Leaping', press: () => _robot.toggleGait('Leaping'), release: noop },
        x: { label: 'Toggle Sit', press: () => _robot.togglePosture('Sitting'), release: noop },
        y: { label: 'Dance', press: () => void _robot.request(presets.dance), release: noop },
    };
    /// Every key starts on its binding in `keyBindings`; writing this store rebinds a key while the
    /// app runs, to any binding the table holds.
    const bindings = writable<Record<keyof typeof keyBindings, (typeof keyBindings)[keyof typeof keyBindings]>>(
        keyBindings,
    );

    /// Runs the `_phase` of the binding of `_key` in `bindings`. An unbound key does nothing.
    const run = (_phase: 'press' | 'release') => (_key: string) => {
        const current = get(bindings);
        if (isIncludedIn(_key, keys(current))) current[_key][_phase]();
    };

    return {
        /// Where the operator stands in the saved sheet.
        pointer: readonly(pointer),
        /// The cue a held key is executing, drawn pressed until the key is released.
        pressed: readonly(pressed),
        strip,
        bindings,
        send,
        move,
        fire,
        rename,
        stopRenaming,
        split,
        merge,
        reorder,
        select,
        extend,
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
