import { constant, countBy, fromKeys, prop } from 'remeda';
import { derived, writable } from 'svelte/store';

export const OUTCOME_NAMES = ['confirmed', 'failed', 'rejected', 'unknown'] as const;

/// `confirmed`: the robot's service accepted the request, which does not prove it moved.
/// `failed`: the robot refused. `rejected`: the WebRTC bridge refused before the robot saw it.
/// `unknown`: no answer in time, so the command may still have run.
export type OutcomeName = (typeof OUTCOME_NAMES)[number];

/// The relay's verdict on one command. `code` is the robot's `status.code`, when it sent one.
export type Outcome = {
    outcome: OutcomeName;
    code: number | null;
    detail: string | null;
};

/// `reqId` is null for a command the browser sent without one.
export type OutcomeEntry = Outcome & {
    reqId: number | null;
    label: string;
    at: number;
};

/// Matches the relay's own result buffer.
const LOG_LIMIT = 200;

/// Every outcome since the control channel opened, newest first.
export const outcomeLog = writable<OutcomeEntry[]>([]);

export function recordOutcome(_entry: OutcomeEntry) {
    outcomeLog.update(function (_log) {
        return [_entry, ..._log].slice(0, LOG_LIMIT);
    });
}

export function clearOutcomes() {
    outcomeLog.set([]);
}

export const lastOutcome = derived(outcomeLog, (_log) => _log.at(0) ?? null);

export const outcomeCounts = derived(outcomeLog, (_log) => ({
    ...fromKeys(OUTCOME_NAMES, constant(0)),
    ...countBy(_log, prop('outcome')),
}));
