import { clamp, isIncludedIn, keys } from 'remeda';
import { get, readonly, writable } from 'svelte/store';
import { CONDUITE } from '../data/cues';
import { KEY_BINDINGS } from '../data/keyBindings';
import { robotState } from './robotState';

/// Creates the cue sheet the operator steps through, sending each cue it fires through `_robotState`.
export const createCueSheet = (_cues: typeof CONDUITE, _robotState: Pick<typeof robotState, 'subscribe' | 'send'>) => {
    const pointer = writable(0);
    const pressed = writable<number | null>(null);

    /// Sends the cue at `_index`, and leaves the pointer and the pressed cue as they are.
    const send = (_index: number) => void _robotState.send(_cues[_index]);

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

    return {
        /// Where the operator stands in the cue sheet.
        pointer: readonly(pointer),
        /// The cue a held key is executing, drawn pressed until the key is released.
        pressed: readonly(pressed),
        send,
        move,
        fire,
        release: () => pressed.set(null),
        /// Runs the binding of `_key` in `KEY_BINDINGS`. An unbound key does nothing.
        press: (_key: string) => {
            if (!isIncludedIn(_key, keys(KEY_BINDINGS))) return;
            const binding = KEY_BINDINGS[_key];
            switch (binding.kind) {
                case 'fire':
                    fire(binding.steps);
                    return;
                case 'move':
                    move(binding.steps);
                    return;
                case 'toggle': {
                    const cue = binding.toggle(get(_robotState));
                    if (cue !== null) void _robotState.send(cue);
                    return;
                }
                case 'send':
                    void _robotState.send(binding.cue);
                    return;
                default:
                    // A binding whose kind this switch does not handle fails type-checking here.
                    binding satisfies never;
            }
        },
    };
};

/// The app's cue sheet, the show's running order, sent through the app's robot state.
export const cueSheet = createCueSheet(CONDUITE, robotState);
