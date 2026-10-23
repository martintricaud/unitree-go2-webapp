import { constant, countBy, fromKeys, prop, take } from 'remeda';
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

/// Every outcome since the control channel opened, newest first.
export const outcomeLog = writable<Outcome[]>([]);

/// The log once `_outcome` is recorded: it goes first, and the oldest entries beyond `LOG_LIMIT` drop.
export const recorded = (_outcome: Outcome) => (_log: Outcome[]) => take([_outcome, ..._log], LOG_LIMIT);

export const lastOutcome = derived(outcomeLog, (_log) => _log.at(0) ?? null);

export const outcomeCounts = derived(outcomeLog, (_log) => ({
    ...fromKeys(OUTCOMES, constant(0)),
    ...countBy(_log, prop('outcome')),
}));
