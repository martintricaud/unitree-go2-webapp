import { concat, entries, fromKeys, keys, map, merge, pipe, values } from 'remeda';
import { ACTIONS, COMMANDABLE_GAITS, POSTURES, dim, enter, leave, perform, recover, sequence, set, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { COLOURS, SPEED_LEVELS } from './settings';

/// The Sabbat dance, whose cues open the cue sheet one by one.
const DANSE_DU_SABBAT: [Cue, ...Cue[]] = [
    enter('FreeWalk'),
    enter('Pose'),
    sequence(
        'Sabots',
        enter('FreeWalk'),
        wait(0.1),
        enter('Backstand'),
        wait(0.1),
        set({ name: 'headlight', value: 'blue' }),
    ),
    sequence('Wizard of Oz', enter('ClassicWalk'), wait(0.1), set({ name: 'headlight', value: 'green' })),
];

const CONTENT_RED: [Cue, ...Cue[]] = [
    set({ name: 'headlight', value: 'red' }),
    wait(0.1),
    perform('Content'),
    wait(0.5),
    enter('FreeWalk'),
];

const EXIT_SIT: [Cue, ...Cue[]] = [leave('Sitting'), enter('FreeWalk')];

/// Cues the operator fires from a key or a button rather than from the cue sheet.
export const presets = {
    contentRed: sequence('', ...CONTENT_RED),
    exitSit: sequence('', ...EXIT_SIT),
    dance: sequence('Dance', perform('Dance2'), wait(0.1), enter('FreeWalk')),
};

const STRETCH_HELLO_JUMP = sequence(
    'Stretch 👋 Jump',
    perform('StopMove'),
    wait(0.1),
    perform('Stretch'),
    perform('Hello'),
    wait(0.3),
    perform('FrontJump'),
    wait(0.6),
    perform('FrontJump'),
    wait(0.1),
    enter('FreeWalk'),
);

const MONOLOGUE = [
    enter('Sitting'),
    sequence('FreeWalk', ...EXIT_SIT),
    sequence('Chien', enter('Bound')),
    enter('FreeWalk'),
    presets.dance,
    // perform('Content'),
    // sequence('Visée Public 1', enter('Pose')),
    // enter('FreeWalk'),
    // sequence('Visée Public 2', enter('Pose')),
    // enter('FreeWalk'),
    // sequence('Visée Public 3', enter('Pose')),
    // enter('FreeWalk'),
    sequence('Ahahah Redlight', ...CONTENT_RED),
    sequence(
        'Assis Whitelight',
        enter('JointLock'),
        wait(0.1),
        enter('Sitting'),
        wait(0.1),
        set({ name: 'headlight', value: 'white' }),
        dim(4),
    ),
    enter('Lying'),
];

/// The performance cue sheet, which the operator steps through with the arrow keys.
export const CONDUITE: [Cue, ...Cue[]] = [
    ...DANSE_DU_SABBAT,
    STRETCH_HELLO_JUMP,
    sequence('Content', perform('Content'), wait(0.05), enter('FreeWalk')),
    sequence('Picture me...', enter('Pose')),
    enter('Handstand'),
    enter('ClassicWalk'),
    perform('Heart'),
    sequence('Salto', perform('LeftFlip'), enter('FreeWalk')),
    ...MONOLOGUE,
];

/// The cue entering each gait the app can enter, and each posture.
const GAIT_CUES = fromKeys(COMMANDABLE_GAITS, enter);
const POSTURE_CUES = fromKeys(keys(POSTURES), enter);

/// The default pane: the buttons of each group, in the order they are drawn. A light is labelled
/// with its colour, which its button shows, and a speed with its name.
export const PANE = {
    actions: pipe(ACTIONS, map(perform), concat([recover()])),
    gaits: values(GAIT_CUES),
    postures: values(POSTURE_CUES),
    lights: pipe(COLOURS, map((_colour) => merge(set({ name: 'headlight', value: _colour }), { label: _colour }))),
    speeds: pipe(SPEED_LEVELS, entries(), map(([_name, _level]) => merge(set({ name: 'speed', value: _level }), { label: _name }))),
};

/// The pane's groups.
export const PANE_GROUPS = keys(PANE);

/// The controller's face keys, each linked to a cell of the document or unassigned.
export const KEYS = ['a', 'b', 'x', 'y'] as const;

/// The cue each key is linked to in the default document, if any: the same objects as in `PANE` and
/// `CONDUITE`, so that the store finds their cells by identity.
export const KEYED = {
    a: POSTURE_CUES.Pose,
    b: GAIT_CUES.Bound,
    x: POSTURE_CUES.Sitting,
    y: presets.dance,
} satisfies Partial<Record<(typeof KEYS)[number], Cue>>;
