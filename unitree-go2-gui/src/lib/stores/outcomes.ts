import { constant, countBy, fromKeys, prop } from 'remeda';
import { derived, writable } from 'svelte/store';

/// `confirmed`: the robot's service accepted the request, which does not prove it moved.
/// `unknown`: no answer in time. `failed`: the robot refused.
/// `rejected`: the WebRTC bridge refused before the robot saw it.
export const OUTCOMES = ['confirmed', 'unknown', 'failed', 'rejected'] as const;

/// The verdict on one request. `code` is null when the robot sent no `status.code`.
export type Outcome = {
    outcome: (typeof OUTCOMES)[number];
    code: number | null;
    detail: string;
    reqId: number;
    label: string;
    at: number;
};

/// Matches the relay's own result buffer.
const LOG_LIMIT = 200;

/// Creates a log of outcomes, newest first, holding at most `LOG_LIMIT` entries.
export const createOutcomeLog = () => {
    const { subscribe, set, update } = writable<Outcome[]>([]);
    return {
        subscribe,
        record: (_outcome: Outcome) => update((_log) => [_outcome, ..._log].slice(0, LOG_LIMIT)),
        clear: () => set([]),
    };
};

/// Every outcome since the control channel opened, newest first.
export const outcomeLog = createOutcomeLog();

export const lastOutcome = derived(outcomeLog, (_log) => _log.at(0) ?? null);

export const outcomeCounts = derived(outcomeLog, (_log) => ({
    ...fromKeys(OUTCOMES, constant(0)),
    ...countBy(_log, prop('outcome')),
}));
