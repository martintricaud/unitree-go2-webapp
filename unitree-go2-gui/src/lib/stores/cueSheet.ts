import { clamp, isIncludedIn, keys } from 'remeda';
import { get, readonly, writable } from 'svelte/store';
import { CONDUITE } from '../data/cues';
import { KEY_BINDINGS } from '../data/keyBindings';
import { websocket } from '../utils/webSocketClient';
import type { WebSocketClient } from '../utils/webSocketClient';
import { mirror } from './mirror';

/// Creates the cue sheet the operator steps through, sending each cue it fires through `_client`.
/// A toggle reads the robot's state from `_mirror`.
export const createCueSheet = (
    _cues: typeof CONDUITE,
    _client: Pick<WebSocketClient, 'request'>,
    _mirror: Pick<typeof mirror, 'subscribe'>,
) => {
    const pointer = writable(0);
    const pressed = writable<number | null>(null);
    /// Every key starts on its binding in `KEY_BINDINGS`; writing this store rebinds a key while
    /// the app runs, to any binding the table holds.
    const bindings = writable<{ [_key in keyof typeof KEY_BINDINGS]: (typeof KEY_BINDINGS)[keyof typeof KEY_BINDINGS] }>(
        KEY_BINDINGS,
    );

    /// Sends the cue at `_index`, and leaves the pointer and the pressed cue as they are.
    const send = (_index: number) => void _client.request(_cues[_index]);

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
        bindings,
        send,
        move,
        fire,
        release: () => pressed.set(null),
        /// Runs the binding of `_key` in `bindings`. An unbound key does nothing.
        press: (_key: string) => {
            const current = get(bindings);
            if (!isIncludedIn(_key, keys(current))) return;
            const binding = current[_key];
            switch (binding.kind) {
                case 'fire':
                    fire(binding.steps);
                    return;
                case 'move':
                    move(binding.steps);
                    return;
                case 'toggle': {
                    const cue = binding.toggle(get(_mirror).robot);
                    if (cue !== null) void _client.request(cue);
                    return;
                }
                case 'send':
                    void _client.request(binding.cue);
                    return;
                default:
                    // A binding whose kind this switch does not handle fails type-checking here.
                    binding satisfies never;
            }
        },
    };
};

/// The app's cue sheet, the show's running order, sent through the app's client.
export const cueSheet = createCueSheet(CONDUITE, websocket, mirror);
