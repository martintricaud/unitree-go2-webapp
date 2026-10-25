import { clamp, isIncludedIn, keys } from 'remeda';
import { get, readonly, writable } from 'svelte/store';
import { CONDUITE, presets } from '../data/cues';
import { robot } from './robot';

/// Creates the cue sheet the operator steps through. It sends cues and toggles to `_robot`.
export const createCueSheet = (_cues: typeof CONDUITE, _robot: typeof robot) => {
    const pointer = writable(0);
    const pressed = writable<number | null>(null);

    /// Sends the cue at `_index`, and leaves the pointer and the pressed cue as they are.
    const send = (_index: number) => void _robot.request(_cues[_index]);

    /// The pointer stays on a cue of the sheet.
    const move = (_steps: number) =>
        pointer.update((_at) => clamp(_at + _steps, { min: 0, max: _cues.length - 1 }));

    /// Sends the cue under the pointer, draws it pressed, then moves the pointer by `_steps`.
    const fire = (_steps: number) => {
        const at = get(pointer);
        pressed.set(at);
        send(at);
        move(_steps);
    };

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
        /// Where the operator stands in the cue sheet.
        pointer: readonly(pointer),
        /// The cue a held key is executing, drawn pressed until the key is released.
        pressed: readonly(pressed),
        bindings,
        send,
        move,
        fire,
        press: run('press'),
        release: run('release'),
    };
};

/// The app's cue sheet, the show's running order, sent to the app's robot.
export const cueSheet = createCueSheet(CONDUITE, robot);
