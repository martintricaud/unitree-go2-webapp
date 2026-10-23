import { keys, mapValues } from 'remeda';
import { writable } from 'svelte/store';
import type { Readable } from 'svelte/store';
import type { Outcome } from '../stores/outcomes';

/// Each field waits on its own request, so a verdict on one field leaves the others pending.
/// A field whose pending entry is undefined shows `settled`, so clearing an entry restores the
/// earlier value.
///
/// Each update below spreads the old record under a `mapValues` that replaces all its fields. The
/// spread changes no value; it keeps each field's type, which `mapValues` loses on a generic record.
export type Confirmable<T extends Record<string, unknown>> = {
    settled: T;
    pending: { [K in keyof T]?: { value: T[K]; reqId: number } };
    lastOutcome: { [K in keyof T]?: Outcome };
};

export const displayed = <T extends Record<string, unknown>>(_state: Confirmable<T>): T => ({
    ..._state.settled,
    ...mapValues(_state.settled, (_value, _field) => {
        const _entry = _state.pending[_field];
        return _entry === undefined ? _value : _entry.value;
    }),
});

/// What a control showing one field reports about it.
export function fieldStatus<T extends Record<string, unknown>>(_state: Confirmable<T>, _field: keyof T) {
    if (_state.pending[_field] !== undefined) return 'pending';
    return _state.lastOutcome[_field]?.outcome ?? null;
}

/// There is no `set`, so no caller can show a value that neither the operator asked for nor the
/// robot stated.
export const confirmable = <T extends Record<string, unknown>>(
    settled: T,
): Readable<Confirmable<T>> & {
    propose: (fields: Partial<T>, reqId: number) => void;
    resolve: (reqId: number, outcome: Outcome) => void;
    observe: (fields: Partial<T>) => void;
} => {
    const { subscribe, update } = writable<Confirmable<T>>({ settled, pending: {}, lastOutcome: {} });
    return {
        subscribe,
        /// A field already pending is replaced, so its earlier request's verdict no longer reaches it.
        propose: (fields, reqId) =>
            update((state) => ({
                ...state,
                pending: { ...state.pending, ...mapValues(fields, (_value) => ({ value: _value, reqId })) },
            })),
        /// Only `confirmed` settles: a timeout or a refusal leaves the earlier value displayed.
        /// A verdict that matches no pending field is the identity, so late verdicts are harmless.
        resolve: (reqId, outcome) =>
            update((state) => {
                const isAnswered = (_field: keyof T) => state.pending[_field]?.reqId === reqId;
                if (!keys(state.settled).some(isAnswered)) return state;
                const settles = outcome.outcome === 'confirmed';
                return {
                    settled: {
                        ...state.settled,
                        ...mapValues(state.settled, (_value, _field) => {
                            const _entry = state.pending[_field];
                            return settles && _entry !== undefined && isAnswered(_field) ? _entry.value : _value;
                        }),
                    },
                    pending: {
                        ...state.pending,
                        ...mapValues(state.pending, (_entry, _field) => (isAnswered(_field) ? undefined : _entry)),
                    },
                    lastOutcome: {
                        ...state.lastOutcome,
                        ...mapValues(state.settled, (_value, _field) =>
                            isAnswered(_field) ? outcome : state.lastOutcome[_field],
                        ),
                    },
                };
            }),
        /// A robot report is a value the robot itself states, so it needs no verdict and may bypass
        /// propose and resolve. It replaces `settled` only: a pending proposal stays displayed.
        observe: (fields) => update((state) => ({ ...state, settled: { ...state.settled, ...fields } })),
    };
};
