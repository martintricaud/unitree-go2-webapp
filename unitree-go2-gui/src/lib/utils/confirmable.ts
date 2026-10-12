import { writable } from 'svelte/store';
import type { Readable } from 'svelte/store';
import type { Outcome, OutcomeName } from '../stores/outcomes';

/// Reverting drops `pending`, so `settled` doubles as the value to restore.
export type Confirmable<T> = {
    settled: T;
    pending: { proposed: T; reqId: number } | null;
    lastOutcome: Outcome | null;
};

export const displayed = <T>(state: Confirmable<T>) =>
    state.pending === null ? state.settled : state.pending.proposed;

/// Silence keeps the proposal: the command may have run.
const KEEPS_PROPOSED: Record<OutcomeName, boolean> = {
    confirmed: true,
    unknown: true,
    failed: false,
    rejected: false,
};

/// There is no `set`, so no caller can show a value the robot was never asked for.
export type ConfirmableStore<T> = Readable<Confirmable<T>> & {
    propose: (proposed: T, reqId: number) => void;
    resolve: (reqId: number, outcome: Outcome) => void;
};

export type ConfirmedValue<S> = S extends ConfirmableStore<infer T> ? T : never;

export const confirmable = <T>(settled: T): ConfirmableStore<T> => {
    const { subscribe, update } = writable<Confirmable<T>>({
        settled,
        pending: null,
        lastOutcome: null,
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
                          settled: KEEPS_PROPOSED[outcome.outcome]
                              ? state.pending.proposed
                              : state.settled,
                          pending: null,
                          lastOutcome: outcome,
                      },
            ),
    };
};
