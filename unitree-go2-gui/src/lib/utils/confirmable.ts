import { keys, mapValues } from 'remeda';
import type { Outcome } from '../stores/outcomes.svelte';

/// Each field waits on its own request, so a verdict on one field leaves the others pending.
/// A field whose pending entry is undefined shows `settled`, so clearing an entry restores the
/// earlier value.
export type Confirmable<T extends Record<string, unknown>> = {
    settled: T;
    pending: { [K in keyof T]?: { value: T[K]; reqId: number } };
};

/// The settled values with every pending value laid over them.
export const displayed = <T extends Record<string, unknown>>(_state: Confirmable<T>): T => ({
    // The spread keeps each field's type, as in `resolve`; `mapValues` then replaces every value.
    ..._state.settled,
    ...mapValues(_state.settled, (_value, _field) => {
        const _entry = _state.pending[_field];
        return _entry === undefined ? _value : _entry.value;
    }),
});

/// A field already pending is replaced, so its earlier request's verdict no longer reaches it.
export const propose =
    <T extends Record<string, unknown>>(_fields: Partial<T>, _reqId: number) =>
    (_state: Confirmable<T>): Confirmable<T> => ({
        ..._state,
        pending: { ..._state.pending, ...mapValues(_fields, (_value) => ({ value: _value, reqId: _reqId })) },
    });

/// Only `confirmed` settles: a timeout or a refusal leaves the earlier value displayed.
/// A verdict that matches no pending field returns the same state, so late verdicts are harmless.
export const resolve =
    <T extends Record<string, unknown>>(_reqId: number, _outcome: Outcome) =>
    (_state: Confirmable<T>): Confirmable<T> => {
        const isAnswered = (_field: keyof T) => _state.pending[_field]?.reqId === _reqId;
        if (!keys(_state.settled).some(isAnswered)) return _state;
        const settles = _outcome.outcome === 'confirmed';
        // Each `mapValues` below replaces every field, so the spread before it changes no
        // value. The spread keeps each field's type, which `mapValues` loses on a generic record.
        return {
            settled: {
                ..._state.settled,
                ...mapValues(_state.settled, (_value, _field) => {
                    const _entry = _state.pending[_field];
                    return settles && _entry !== undefined && isAnswered(_field) ? _entry.value : _value;
                }),
            },
            pending: {
                ..._state.pending,
                ...mapValues(_state.pending, (_entry, _field) => (isAnswered(_field) ? undefined : _entry)),
            },
        };
    };

/// A robot report is a value the robot itself states, so it needs no verdict and may bypass
/// `propose` and `resolve`. It replaces `settled` only: a pending proposal stays displayed.
export const settle =
    <T extends Record<string, unknown>>(_fields: Partial<T>) =>
    (_state: Confirmable<T>): Confirmable<T> => ({ ..._state, settled: { ..._state.settled, ..._fields } });
