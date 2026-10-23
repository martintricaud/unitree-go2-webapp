import { writable } from 'svelte/store';
import type { Readable } from 'svelte/store';
import { OUTCOMES } from '../stores/outcomes';
import type { Outcome } from '../stores/outcomes';

/// Reverting drops `pending`, so `settled` doubles as the value to restore.
export type Confirmable<T> = {
    settled: T;
    pending: { proposed: T; reqId: number } | null;
    lastAttempt: { from: T; proposed: T; outcome: Outcome } | null;
};

export const displayed = <T>(state: Confirmable<T>) =>
    state.pending === null ? state.settled : state.pending.proposed;

/// What a control showing one field reports about it.
export function fieldStatus<T>(_state: Confirmable<T>, _field: keyof T) {
    if (_state.pending !== null && _state.pending.proposed[_field] !== _state.settled[_field])
        return 'pending';
    if (
        _state.lastAttempt !== null &&
        _state.lastAttempt.proposed[_field] !== _state.lastAttempt.from[_field]
    )
        return _state.lastAttempt.outcome.outcome;
    return null;
}

/// There is no `set`, so no caller can show a value that neither the operator asked for nor the
/// robot stated.
export const confirmable = <T>(
    settled: T,
): Readable<Confirmable<T>> & {
    propose: (proposed: T, reqId: number) => void;
    resolve: (reqId: number, outcome: Outcome) => void;
    observe: (fields: Partial<T>) => void;
} => {
    const { subscribe, update } = writable<Confirmable<T>>({
        settled,
        pending: null,
        lastAttempt: null,
    });
    return {
        subscribe,
        propose: (proposed, reqId) => update((state) => ({ ...state, pending: { proposed, reqId } })),
        // A verdict on any other request is the identity, so late verdicts are harmless.
        resolve: (reqId, outcome) =>
            update((state) =>
                state.pending === null || state.pending.reqId !== reqId
                    ? state
                    : {
                          settled: OUTCOMES[outcome.outcome].mayHaveRun
                              ? state.pending.proposed
                              : state.settled,
                          pending: null,
                          lastAttempt: { from: state.settled, proposed: state.pending.proposed, outcome },
                      },
            ),
        /// A robot report is a value the robot itself states, so it needs no verdict and may bypass
        /// propose and resolve. It replaces `settled` only: a pending proposal stays displayed.
        observe: (fields) => update((state) => ({ ...state, settled: { ...state.settled, ...fields } })),
    };
};
