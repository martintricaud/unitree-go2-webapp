import { dim, enter, leave, orient, perform, sequence, set, wait } from '../utils/commands';

const DANSE_DU_SABBAT = sequence(
    'Sabbat',
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
);

/// Cues the operator fires from a key or a button rather than from the cue sheet.
export const presets = {
    stopAndCrouch: sequence('', perform('StopMove'), perform('StandDown')),
    stopAndStand: sequence('', perform('StopMove'), perform('StandUp')),
    holdAim: sequence('', orient(0, -1, 0)),
    contentRed: sequence(
        '',
        set({ name: 'headlight', value: 'red' }),
        wait(0.1),
        perform('Content'),
        wait(0.5),
        enter('FreeWalk'),
    ),
    standContent: sequence(
        '',
        wait(0.1),
        perform('BalanceStand'),
        wait(0.1),
        enter('FreeWalk'),
        wait(0.1),
        perform('Content'),
        wait(0.1),
        enter('FreeWalk'),
        wait(0.1),
    ),
    exitSit: sequence('', perform('RiseSit'), enter('FreeWalk')),
    exitPose: sequence('', leave('Pose'), wait(0.1), enter('FreeWalk')),
    enterPose: sequence('', perform('StopMove'), enter('Pose')),
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
    perform('Sit'),
    sequence('FreeWalk', ...presets.exitSit.items),
    sequence('Chien', enter('Leaping')),
    enter('FreeWalk'),
    presets.dance,
    // perform('Content'),
    // sequence('Visée Public 1', perform('StopMove'), enter('Pose')),
    // enter('FreeWalk'),
    // sequence('Visée Public 2', perform('StopMove'), enter('Pose')),
    // enter('FreeWalk'),
    // sequence('Visée Public 3', perform('StopMove'), enter('Pose')),
    // enter('FreeWalk'),
    sequence('Ahahah Redlight', ...presets.contentRed.items),
    sequence(
        'Assis Whitelight',
        perform('StandUp'),
        wait(0.1),
        perform('Sit'),
        wait(0.1),
        set({ name: 'headlight', value: 'white' }),
        dim(4),
    ),
    perform('StandDown'),
];

/// The performance cue sheet, which the operator steps through with the arrow keys.
export const CONDUITE = [
    ...DANSE_DU_SABBAT.items,
    STRETCH_HELLO_JUMP,
    sequence('Content', perform('Content'), wait(0.05), enter('FreeWalk')),
    sequence('Picture me...', perform('StopMove'), enter('Pose')),
    enter('Handstand'),
    enter('ClassicWalk'),
    perform('FingerHeart'),
    sequence('Salto', perform('LeftFlip'), enter('FreeWalk')),
    ...MONOLOGUE,
];
