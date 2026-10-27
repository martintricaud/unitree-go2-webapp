import { concat, keys, map, pipe } from 'remeda';
import { ACTIONS, COMMANDABLE_GAITS, POSTURES, dim, enter, leave, perform, recover, sequence, set, wait } from '../utils/commands';
import type { Cue } from '../utils/commands';
import { COLOURS } from './settings';

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
    sequence('Chien', enter('Leaping')),
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

/// The default pane: the buttons of each group, in the order they are drawn.
export const PANE = {
    actions: pipe(ACTIONS, map(perform), concat([recover()])),
    gaits: pipe(COMMANDABLE_GAITS, map(enter)),
    postures: pipe(POSTURES, keys(), map(enter)),
    lights: pipe(COLOURS, map((_colour) => set({ name: 'headlight', value: _colour }))),
};

/// The pane's groups.
export const PANE_GROUPS = keys(PANE);
