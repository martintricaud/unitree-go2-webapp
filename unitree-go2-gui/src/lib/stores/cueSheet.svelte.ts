import { clamp, constant, doNothing, drop, entries, evolve, filter, first, findIndex, flat, flatMap, forEach, hasAtLeast } from 'remeda';
import { identity, isDeepEqual, isEmpty, isIncludedIn, isNullish, isStrictEqual, keys, last, map, mapValues, merge, pickBy, pipe, piped } from 'remeda';
import { prop, range, reduce, set, splice, take, values, zip } from 'remeda';
import type { Updater, Writable } from 'svelte/store';
import * as v from 'valibot';
import { covered, move, span, within } from '../utils/lists';
import { CONDUITE, KEYED, KEYS, PANE, PANE_GROUPS } from '../data/cues';
import { COMMANDABLE_GAITS, POSTURES, cells, cellSchema, commandsOf, distinctIn, isCommandable } from '../utils/commands';
import { face, postureChange, sheetSchema, transition } from '../utils/commands';
import { nextId, opened } from '../utils/trees';
import type { Cell, Cue } from '../utils/commands';
import { robot } from './robot.svelte';

/// The storage key of the saved document. A change to the document's shape must change it, so that
/// documents stored in the old shape are ignored.
const KEY = 'cueSheet.v2';

type PaneGroup = (typeof PANE_GROUPS)[number];
type Key = (typeof KEYS)[number];

/// The cells each pane group accepts, checked on a stored cell before it is parsed. Each kind's
/// output is unknown, so that `cellSchema` parses the checked input.
const PANE_KINDS: Record<PaneGroup, v.GenericSchema> = {
    actions: v.looseObject({ name: v.picklist(['perform', 'recover']) }),
    gaits: v.looseObject({ name: v.literal('enter'), args: v.tuple([v.picklist(COMMANDABLE_GAITS)]) }),
    postures: v.looseObject({ name: v.literal('enter'), args: v.tuple([v.picklist(keys(POSTURES))]) }),
    lights: v.looseObject({ name: v.literal('set'), args: v.tuple([v.looseObject({ name: v.literal('headlight') })]) }),
};

/// The document: the sheet the operator steps through, the cells of the pane's buttons, and the
/// cell each controller key is linked to; an absent key is unassigned.
type Document = { sheet: Cell[]; pane: Record<PaneGroup, Cell[]>; bindings: Partial<Record<Key, number>> };

/// The top-level cells of the sheet and of each pane group: the cells drawn as buttons. Generic,
/// so that it also lists the default cues, and takes a parsed document, whose sheet is non-empty.
const cellsOf = <T>({ sheet, pane }: { sheet: T[]; pane: Record<PaneGroup, T[]> }) => [...sheet, ...pipe(pane, values(), flat())];

/// The document of `_sheet`, `_pane` and the links to identifiers a drawn cell holds, so that every
/// key is either unassigned or linked to a button. Any other field of the argument is left out.
/// Generic, so that the schema's transform takes the parsed document's own type.
const resolved = <D extends Document>({ sheet, pane, bindings }: D): Document =>
    pipe(map(cellsOf({ sheet, pane }), prop('id')), (_drawn) => ({
        sheet,
        pane,
        bindings: pickBy(bindings, (_id) => isIncludedIn(_id, _drawn)),
    }));

/// The stored document: the sheet, each pane group as `stored` writes them, and the bindings,
/// every identifier held by one cell only. The format's version is optional, because documents
/// saved before it was added lack it. A binding to a missing cell is dropped.
export const documentSchema = v.pipe(
    v.strictObject({
        version: v.optional(v.literal(2)),
        sheet: sheetSchema,
        pane: v.strictObject(mapValues(PANE_KINDS, (_kind) => v.array(v.pipe(_kind, cellSchema)))),
        bindings: v.record(v.picklist(KEYS), v.number()),
    }),
    distinctIn(cellsOf),
    v.transform(resolved),
);

/// The document as JSON text, as storage and an imported file hold it.
const documentText = v.pipe(v.string(), v.parseJson(), documentSchema);

/// The document of `_cues` and the default pane: the sheet numbered from 0, then each pane group
/// above every identifier numbered before it. Each key links to the cell numbered from its
/// default cue, found by identity; a default cue missing from `_cues` leaves its key unassigned.
const numberedDocument = (_cues: Cue[]) => {
    const document = pipe(
        PANE_GROUPS,
        reduce(
            (_document: Document, _group) =>
                merge(_document, { pane: set(_document.pane, _group, cells(PANE[_group], nextId(cellsOf(_document)))) }),
            { sheet: cells(_cues, 0), pane: mapValues(PANE, () => []), bindings: {} },
        ),
    );
    const pairs = zip(cellsOf({ sheet: _cues, pane: PANE }), cellsOf(document));
    const idOf = (_cue: Cue | undefined) =>
        pipe(pairs, filter(([_default]) => _default === _cue), map(([, _cell]) => _cell.id), first());
    return resolved(merge(document, { bindings: mapValues(KEYED, idOf) }));
};

/// What a key linked to a cell does, as the cell's button does: the cell is sent, except that a
/// pane gait or light switches to the value its cell reaches and back, and a posture pair sends
/// the side the robot's state allows.
const send = (_robot: typeof robot, _cell: Cell) => void _robot.request(_cell);
const reached = (_robot: typeof robot, _cell: Cell) => transition(_cell)(_robot.current.state.settled);

/// The sides of a cell the robot's state allows, each the cue one of its buttons sends. Every cell
/// but a posture pair has one side, itself, always allowed.
const itself = (_robot: typeof robot, _cell: Cell) => [_cell];

/// Why the robot cannot take a cell yet, or null once it can: a sheet cell always; a pane cell once
/// the robot is connected, and a gait or a posture once it has also reported its gait or posture.
const connected = (_robot: typeof robot) => (_robot.current.robotConnected ? null : 'the robot is not connected');
const motionKnown = (_robot: typeof robot) =>
    connected(_robot) ??
    (_robot.current.reported.gait || _robot.current.reported.posture ? null : 'the robot has not reported its gait or posture');

const PANE_KEYS: Record<
    PaneGroup,
    {
        act: (_robot: typeof robot, _cell: Cell) => void;
        refusal: (_robot: typeof robot) => string | null;
        available: (_robot: typeof robot, _cell: Cell) => Cue[];
    }
> = {
    actions: { act: send, refusal: connected, available: itself },
    // A posture pair has two sides, the posture's entry and its exit, and allows the one
    // `postureChange` gives.
    postures: {
        act: (_robot, _cell) => pipe(reached(_robot, _cell).posture, (_posture) => _posture && _robot.togglePosture(_posture)),
        refusal: motionKnown,
        available: (_robot, _cell) =>
            pipe(reached(_robot, _cell).posture, (_posture) => (_posture ? postureChange(_posture)(_robot.current.state.settled) : [])),
    },
    gaits: {
        act: (_robot, _cell) => pipe(reached(_robot, _cell).gait, (_gait) => isCommandable(_gait) && _robot.toggleTo('gait', _gait)),
        refusal: motionKnown,
        available: itself,
    },
    lights: { act: (_robot, _cell) => _robot.toggleTo('headlight', reached(_robot, _cell).headlight), refusal: connected, available: itself },
};

/// Why the robot cannot take `_sides`, the sides of a cell a press would send, or null when it can:
/// the cell's own refusal, or no side the robot's state allows.
const refusalOf = (_robot: typeof robot, { refusal }: (typeof PANE_KEYS)[PaneGroup], _sides: Cue[]) =>
    refusal(_robot) ?? (isEmpty(_sides) ? "the robot's posture does not allow it" : null);

/// Each drawn cell of `_document`, with what a key linked to it does, when the robot can take it,
/// and which of its sides the robot's state allows.
const targets = ({ sheet, pane }: Document) => [
    ...map(sheet, (_cell) => ({ act: send, refusal: constant(null), available: itself, cell: _cell })),
    ...pipe(PANE_GROUPS, flatMap((_group) => map(pane[_group], (_cell) => merge(PANE_KEYS[_group], { cell: _cell })))),
];

/// The target of `_document` whose cell has identifier `_id`, as zero or one.
const targetOf = (_document: Document, _id: Cell['id'] | undefined) =>
    pipe(targets(_document), filter(({ cell }) => cell.id === _id));

/// The target of `_document` that `_key` is linked to, as zero or one.
const linksOf = (_document: Document, _key: Key) => targetOf(_document, _document.bindings[_key]);

/// The strip's tools, which edit the sheet.
export const SHEET_TOOLS = ['Move', 'Rename', 'Group', 'Ungroup'] as const;

/// The instruments: Fire plays the sheet, the sheet tools edit it, and Assign links keys to cells.
const INSTRUMENTS = ['Fire', ...SHEET_TOOLS, 'Assign'] as const;

/// Runs `_act`, or gives `_fallback` when it throws. Storage can be missing, full or forbidden,
/// and the sheet must keep working in memory in every case.
const attempt = <T>(_act: () => T, _fallback: T) => {
    try {
        return _act();
    } catch {
        return _fallback;
    }
};

/// The state of a document that plays its sheet from the first cell, under `_instrument`. The
/// parameter admits every instrument, so that `choose` can replace the one it starts on.
const playing = (_document: Document, _instrument: (typeof INSTRUMENTS)[number] = 'Fire') => ({
    saved: _document, // the document Save last stored
    shown: _document, // the document shown; equal to `saved` under Fire
    pointer: 0,
    pressed: null as { id: Cell['id']; cue: Cue } | null, // the cell a held key fired, and which of its sides
    instrument: _instrument,
    renaming: null as number | null,
    key: null as Key | null, // the key Assign links to the next cell chosen
    problem: null as string | null, // why the last import failed, shown until the next action
});

/// The cue sheet the operator steps through, sending cues and toggles to a robot. Under Fire it
/// plays the saved document; under the other instruments the operator edits the shown document,
/// its sheet or its key links, which Save makes the saved one and writes to storage. Indices name
/// drawn cells: the strip hands over no other.
export class CueSheet implements Pick<Writable<ReturnType<typeof playing>>, 'update'> {
    #robot: typeof robot;
    #storage: Pick<Storage, 'getItem' | 'setItem'>;
    state: ReturnType<typeof playing>;

    /// Starts on the document last saved to `_storage`, or on `_cues` and the default pane when it
    /// holds no valid document.
    constructor(_cues: Cue[], _robot: typeof robot, _storage: Pick<Storage, 'getItem' | 'setItem'>) {
        this.#robot = _robot;
        this.#storage = _storage;
        const read = v.safeParse(documentText, attempt(() => _storage.getItem(KEY), null));
        this.state = $state.raw(playing(read.success ? read.output : numberedDocument(_cues)));
    }

    /// An arrow function, so a caller may pass it detached from the object, as `Writable` allows.
    update = (_change: Updater<CueSheet['state']>) => {
        this.state = _change(this.state);
    };

    /// What a sweep from cell `a` to cell `b` does under each instrument: the cells shown and the
    /// cells highlighted while the pointer is down, and the effect on release. Fire and Assign
    /// highlight nothing. Move shows the cells as its release will leave them, and highlights only
    /// the moved cell, which follows the pointer.
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
        Assign: { shown: () => identity(), swept: () => [], release: (_a, _b) => this.#bind(this.state.shown.sheet[_b]) },
    };

    /// Forgets why the last import failed: every action after it ends the message.
    #dismiss = () => this.update(set('problem', null));

    /// Applies the sweep from cell `_a` to cell `_b` with the active instrument.
    sweep = (_a: number, _b: number) => {
        this.#dismiss();
        this.instruments[this.state.instrument].release(_a, _b);
    };

    /// Replaces the state by `_change` of it, and ends any renaming and any import message.
    #edit = (_change: Updater<CueSheet['state']>) =>
        this.update(piped(_change, set('renaming', null), set('problem', null)));

    /// Makes `_instrument` the active one with `_key` selected, and ends any renaming.
    #enter = (_instrument: CueSheet['state']['instrument'], _key: Key | null) =>
        this.#edit(piped(set('instrument', _instrument), set('key', _key)));

    /// Makes `_instrument` the active one, with no key selected. The status strip's Edit is
    /// `choose('Move')`.
    choose = (_instrument: CueSheet['state']['instrument']) => this.#enter(_instrument, null);

    /// Makes Assign the active one, with `_key` selected for linking to the next cell chosen.
    selectKey = (_key: Key) => this.#enter('Assign', _key);

    /// Makes the label of cell `_index` editable, unless the cell sends no command: such a cell
    /// only waits, and its label states how long.
    startRenaming = (_index: number) => {
        if (!isEmpty(commandsOf(this.state.shown.sheet[_index]))) this.update(set('renaming', _index));
    };

    /// Ends any renaming and keeps the label.
    stopRenaming = () => this.update(set('renaming', null));

    /// Replaces the cells from `_a` to `_b`, in either order, by `_change` of them and of the state,
    /// and ends any renaming. A pointer on a replaced cell lands on the first new one; a pointer after them
    /// keeps its cell. A key linked to a cell the change removes from the top level is unassigned.
    #replace = (_a: number, _b: number, _change: (_run: Cell[], _state: CueSheet['state']) => Cell[]) => {
        const [lo, hi] = span(_a, _b);
        const count = hi - lo + 1;
        this.#edit((_state) => {
            const made = _change(pipe(_state.shown.sheet, drop(lo), take(count)), _state);
            return evolve(_state, {
                shown: (_shown) => resolved(evolve(_shown, { sheet: splice(lo, count, made) })),
                pointer: (_at) => (_at > hi ? _at + made.length - count : clamp(_at, { max: lo })),
            });
        });
    };

    /// Gives cell `_index` the label `_label`, and ends any renaming.
    rename = (_index: number, _label: string) => this.#replace(_index, _index, map(merge({ label: _label })));

    /// Replaces the cells from `_a` to `_b` by one group of them, labelled with its first and last
    /// labels, under an identifier no shown cell holds. A range of one cell stays as it is.
    group = (_a: number, _b: number) =>
        this.#replace(_a, _b, (_run, { shown }) =>
            hasAtLeast(_run, 2) ? [{ id: nextId(cellsOf(shown)), label: `${first(_run).label} → ${last(_run).label}`, items: _run }] : _run,
        );

    /// Replaces every cell from `_a` to `_b` by its constituents; a cell without any stays as it is.
    ungroup = (_a: number, _b: number) =>
        this.#replace(_a, _b, flatMap(opened<Cell>));

    /// Moves cell `_from` to position `_to`, and ends any renaming. The pointer keeps its cell: the
    /// same move, applied to the indices, says where each cell lands.
    reorder = (_from: number, _to: number) =>
        this.#edit((_state) =>
            merge(_state, {
                shown: merge(_state.shown, { sheet: move(_from, _to)(_state.shown.sheet) }),
                pointer: pipe(range(0, _state.shown.sheet.length), move(_from, _to), findIndex(isStrictEqual(_state.pointer))),
            }),
        );

    /// Shows `_document`, keeps the instrument, and ends any renaming. The pointer keeps its index,
    /// moved onto the last cell when `_document` has fewer cells.
    #show = (_document: Document) =>
        this.#edit((_state) => merge(_state, { shown: _document, pointer: within(_document.sheet, _state.pointer) }));

    /// Shows the saved document again.
    reset = () => this.#show(this.state.saved);

    /// The shown document as JSON text, as storage and an exported file hold it.
    exported = () => {
        return JSON.stringify(merge({ version: 2 }, this.state.shown), null, 2);
    };

    /// Shows the document of the JSON text `_text` until Save or Cancel. When `_text` holds no valid
    /// document, the shown one stays, and Valibot's message for the first issue, with its location,
    /// is recorded until the next action.
    import = (_text: string) =>
        pipe(v.safeParse(documentText, _text), (_read) =>
            _read.success ? this.#show(_read.output) : this.update(set('problem', v.summarize([first(_read.issues)]))),
        );

    /// Discards the edits and returns to play mode.
    cancel = () => {
        this.reset();
        this.choose('Fire');
    };

    /// Makes the shown document the saved one, writes it to storage, and returns to play mode with
    /// no cell pressed.
    save = () => {
        attempt(() => this.#storage.setItem(KEY, this.exported()), undefined);
        this.update((_state) => merge(_state, { saved: _state.shown, pressed: null }));
        this.choose('Fire');
    };

    /// Moves the pointer by `_steps`, and keeps it on the first and the last cell.
    move = (_steps: number) =>
        this.update((_state) => evolve(_state, { pointer: (_at) => within(_state.shown.sheet, _at + _steps) }));

    /// Sends the cue of cell `_index`.
    send = (_index: number) => void this.#robot.request(this.state.shown.sheet[_index]);

    /// Sends the cue under the pointer, draws it pressed, then moves the pointer by `_steps`.
    fire = (_steps: number) => {
        this.send(this.state.pointer);
        this.#press(this.state.shown.sheet[this.state.pointer]);
        this.move(_steps);
    };

    /// Draws the side `_cue` of `_cell`, the cell itself unless given, pressed until the key that
    /// fired it is released.
    #press = (_cell: Cell, _cue: Cue = _cell) => this.update(set('pressed', { id: _cell.id, cue: _cue }));

    /// Ends the pressed drawing of the cell with identifier `_id`, and keeps any other drawn.
    #unpress = (_id: Cell['id']) =>
        this.update((_state) => (_state.pressed?.id === _id ? set(_state, 'pressed', null) : _state));

    /// Whether the side `_cue` of `_cell`, the cell itself unless given, is drawn pressed.
    isPressed = (_cell: Cell, _cue: Cue = _cell) => isDeepEqual(this.state.pressed, { id: _cell.id, cue: _cue });

    /// Links the selected key to `_cell` in the shown document; does nothing while no key is
    /// selected.
    #bind = ({ id }: Cell) =>
        this.update((_state) => {
            const { key } = _state;
            return key === null ? _state : evolve(_state, { shown: { bindings: (_links) => set(_links, key, id) } });
        });

    /// For the target of `_cell` in the shown document, as zero or one, why the robot cannot take its
    /// side `_cue`, or null when it can.
    #refusals = ({ id }: Cell, _cue: Cue) =>
        map(targetOf(this.state.shown, id), (_target) =>
            refusalOf(this.#robot, _target, filter(_target.available(this.#robot, _target.cell), isDeepEqual(_cue))),
        );

    /// What a pane button does with its cell: Assign links the selected key to `_cell`; every other
    /// instrument sends `_cue`, the cell itself unless the button sends another side of it, once the
    /// robot can take that side, and logs the press as blocked until then.
    use = (_cell: Cell, _cue: Cue = _cell) => {
        this.#dismiss();
        if (this.state.instrument === 'Assign') this.#bind(_cell);
        else
            forEach(this.#refusals(_cell, _cue), (_refused) =>
                _refused === null ? void this.#robot.request(_cue) : this.#robot.block(face(_cue), _refused),
            );
    };

    /// The cell `_key` is linked to in the shown document, if any.
    linked = (_key: Key) => pipe(linksOf(this.state.shown, _key), map(prop('cell')), first());

    /// Whether `_cell` is the one the key selected under Assign is linked to, which the strip and the
    /// pane draw highlighted.
    isTarget = ({ id }: Cell) => this.state.key !== null && this.linked(this.state.key)?.id === id;

    /// Whether the pane button sending the side `_cue` of `_cell` has an effect, which the pane
    /// draws greyed when it has none: under Assign it links the selected key; under every other
    /// instrument it sends once the robot can take that side.
    usable = (_cell: Cell, _cue: Cue = _cell) =>
        this.state.instrument === 'Assign' || pipe(this.#refusals(_cell, _cue), filter(isNullish), hasAtLeast(1));

    /// A face key under Fire draws pressed the side the robot's state allows of the cell it is
    /// linked to in the saved document, and acts on the cell once the robot can take it; it logs
    /// the press as blocked for an unassigned key, a cell with no side allowed, or a robot that
    /// cannot take the cell yet. Under every edit instrument it selects itself under Assign.
    #trigger = (_key: Key) => {
        if (this.state.instrument !== 'Fire') return this.selectKey(_key);
        const links = linksOf(this.state.saved, _key);
        if (isEmpty(links)) this.#robot.block(_key, 'no cell is linked to this key');
        forEach(links, (_target) => {
            const sides = _target.available(this.#robot, _target.cell);
            forEach(sides, (_side) => this.#press(_target.cell, _side));
            const refused = refusalOf(this.#robot, _target, sides);
            if (refused === null) _target.act(this.#robot, _target.cell);
            else this.#robot.block(face(first(sides) ?? _target.cell), refused);
        });
    };

    /// Ends the pressed drawing of the cell a released arrow or Enter fired.
    #released = () => this.update(set('pressed', null));

    /// What the arrows and Enter do when pressed and when released; they press only under Fire.
    /// `label` names each for the operator.
    arrows = {
        ArrowRight: { label: 'Fire, then next cue', press: () => this.fire(1), release: this.#released },
        ArrowLeft: { label: 'Fire, then previous cue', press: () => this.fire(-1), release: this.#released },
        ArrowDown: { label: 'Next cue', press: () => this.move(1), release: doNothing() },
        ArrowUp: { label: 'Previous cue', press: () => this.move(-1), release: doNothing() },
        Enter: { label: 'Fire', press: () => this.fire(0), release: this.#released },
    };

    /// The arrow named `_key`, as zero or one entry.
    #arrow = (_key: string) => pipe(this.arrows, entries(), filter(([_name]) => _name === _key), map(([, _arrow]) => _arrow));

    /// The face key named `_key`, as zero or one.
    #face = (_key: string) => pipe(KEYS, filter(isStrictEqual(_key)));

    /// Runs the press of `_key`: an arrow's under Fire, a face key's always. Any other key matches nothing.
    press = (_key: string) => {
        this.#dismiss();
        forEach(this.state.instrument === 'Fire' ? this.#arrow(_key) : [], (_arrow) => _arrow.press());
        forEach(this.#face(_key), this.#trigger);
    };

    /// Runs the release of `_key`: an arrow's, and for a face key the end of its linked cell's
    /// pressed drawing.
    release = (_key: string) => {
        forEach(this.#arrow(_key), (_arrow) => _arrow.release());
        forEach(this.#face(_key), (_face) => forEach(linksOf(this.state.saved, _face), ({ cell }) => this.#unpress(cell.id)));
    };
}

/// The app's cue sheet, the show's running order or the sheet last saved in the browser, sent to
/// the app's robot. Storage is read only when called, inside `attempt`, because a browser that
/// blocks site data throws on reading `localStorage`.
export const cueSheet = new CueSheet(CONDUITE, robot, {
    getItem: (_key) => globalThis.localStorage.getItem(_key),
    setItem: (_key, _value) => globalThis.localStorage.setItem(_key, _value),
});
