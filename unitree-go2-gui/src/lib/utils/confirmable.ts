import { writable } from 'svelte/store';
import type { Readable } from 'svelte/store';
import type { Outcome, OutcomeName } from './outcome';

/// What one control knows about the value it shows: the value the robot is believed to hold,
/// the value the operator asked for and the robot has not answered on yet, and the verdict on
/// the last thing this control asked for.
///
/// Two fields this deliberately does not carry. A value to restore on a refusal: `settled` is
/// already that value, so reverting is dropping `pending` rather than keeping a second field
/// correct. A `confirmed` boolean: `lastOutcome` already says it, and holding both invites the
/// two to disagree.
export type Confirmable<T> = {
    settled: T;
    pending: { proposed: T; reqId: number } | null;
    lastOutcome: Outcome | null;
};

/// What the control shows: the operator's unanswered choice while one is outstanding, and the
/// value the robot last confirmed the rest of the time.
export const displayed = <T>(state: Confirmable<T>): T =>
    state.pending === null ? state.settled : state.pending.proposed;

/// Whether the proposed value survives the verdict on it. A refusal is the only answer that
/// takes the value back. Silence leaves the command possibly executed, so the control keeps
/// what the operator asked for and `lastOutcome` records that the robot never confirmed it.
const KEEPS_PROPOSED: Record<OutcomeName, boolean> = {
    confirmed: true,
    unknown: true,
    failed: false,
    rejected: false,
};

/// The state a verdict leaves the control in.
///
/// A verdict naming a request the control is not waiting on returns the state it was given,
/// unchanged and identical. A superseded or duplicated verdict is therefore not a case to
/// guard against: it acts as the identity, so verdicts arriving out of order leave the control
/// on the newest proposal.
const stateAfter = <T>(
    state: Confirmable<T>,
    reqId: number,
    outcome: Outcome,
): Confirmable<T> => {
    if (state.pending === null || state.pending.reqId !== reqId) return state;
    return {
        settled: KEEPS_PROPOSED[outcome.outcome] ? state.pending.proposed : state.settled,
        pending: null,
        lastOutcome: outcome,
    };
};

/// A control's value together with whether the robot has confirmed it. `propose` and `resolve`
/// are the only writes: there is no `set`, so no caller can leave a control showing a value the
/// robot was never asked for.
export type ConfirmableStore<T> = Readable<Confirmable<T>> & {
    propose: (proposed: T, reqId: number) => void;
    resolve: (reqId: number, outcome: Outcome) => void;
};

/// The type of value a confirmable store holds, read off the store itself, so a record of
/// stores yields the record of their values without restating either.
export type ConfirmedValue<S> = S extends ConfirmableStore<infer T> ? T : never;

/// A control that starts on `settled` with nothing outstanding and no verdict yet.
export const confirmable = <T>(settled: T): ConfirmableStore<T> => {
    const { subscribe, update } = writable<Confirmable<T>>({
        settled,
        pending: null,
        lastOutcome: null,
    });
    return {
        subscribe,
        propose: (proposed, reqId) => update((state) => ({ ...state, pending: { proposed, reqId } })),
        resolve: (reqId, outcome) => update((state) => stateAfter(state, reqId, outcome)),
    };
};
