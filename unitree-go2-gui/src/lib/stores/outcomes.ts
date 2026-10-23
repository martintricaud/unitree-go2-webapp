import { constant, countBy, mapValues, prop } from 'remeda';
import { derived, writable } from 'svelte/store';

/// `confirmed`: the robot's service accepted the request, which does not prove it moved.
/// `unknown`: no answer in time. `failed`: the robot refused.
/// `rejected`: the WebRTC bridge refused before the robot saw it.
export const OUTCOMES = {
    confirmed: true,
    unknown: true,
    failed: true,
    rejected: true,
} as const;

/// The verdict on one request. `code` is null when the robot sent no `status.code`.
export type Outcome = {
    outcome: keyof typeof OUTCOMES;
    code: number | null;
    detail: string;
    reqId: number;
    label: string;
    at: number;
};

/// Matches the relay's own result buffer.
const LOG_LIMIT = 200;

/// Every outcome since the control channel opened, newest first.
export const outcomeLog = writable<Outcome[]>([]);

export function recordOutcome(_outcome: Outcome) {
    outcomeLog.update(function (_log) {
        return [_outcome, ..._log].slice(0, LOG_LIMIT);
    });
}

export function clearOutcomes() {
    outcomeLog.set([]);
}

export const lastOutcome = derived(outcomeLog, (_log) => _log.at(0) ?? null);

export const outcomeCounts = derived(outcomeLog, (_log) => ({
    ...mapValues(OUTCOMES, constant(0)),
    ...countBy(_log, prop('outcome')),
}));
