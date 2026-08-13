import { derived, writable } from 'svelte/store';

const OUTCOME_NAMES = ['confirmed', 'failed', 'rejected', 'unknown'] as const;

/// The four answers a command can get. `confirmed` means the robot's service accepted the
/// request, which is not the same as having performed the motion; `failed` means it refused
/// and said so; `rejected` means the WebRTC bridge turned the request away before the robot
/// saw it; `unknown` means nothing came back in time, so the command may still have run.
export type OutcomeName = (typeof OUTCOME_NAMES)[number];

/// What the relay decided about one command. `code` is the robot's `status.code` where it sent
/// one, and `detail` is the sentence to show an operator.
export type Outcome = {
    outcome: OutcomeName;
    code: number | null;
    detail: string | null;
};

/// One line of the outcome log: an outcome, the command it belongs to, and when it landed.
/// `reqId` is null for a command sent without one, which the log still shows.
export type OutcomeEntry = Outcome & {
    reqId: number | null;
    label: string;
    at: number;
};

/// Matches the relay's own result buffer, so neither side keeps a longer history than the other.
const LOG_LIMIT = 200;

const ZERO_COUNTS: Record<OutcomeName, number> = {
    confirmed: 0,
    failed: 0,
    rejected: 0,
    unknown: 0,
};

const isOutcomeName = (value: unknown): value is OutcomeName =>
    typeof value === 'string' && OUTCOME_NAMES.some((name) => name === value);

/// Read a relay `command_result` as an Outcome. A field the relay did not send, or sent in a
/// shape this browser does not know, reads as `unknown` rather than as a confirmation.
export const readOutcome = (msg: Record<string, unknown>): Outcome => ({
    outcome: isOutcomeName(msg.outcome) ? msg.outcome : 'unknown',
    code: typeof msg.code === 'number' ? msg.code : null,
    detail: typeof msg.detail === 'string' ? msg.detail : null,
});

/// Every outcome since the control channel opened, newest first.
export const outcomeLog = writable<OutcomeEntry[]>([]);

export const recordOutcome = (entry: OutcomeEntry) => {
    outcomeLog.update((log) => [entry, ...log].slice(0, LOG_LIMIT));
};

/// Empty the log. The counts are per connection, so they start again with the channel.
export const clearOutcomes = () => outcomeLog.set([]);

export const lastOutcome = derived(outcomeLog, (log): OutcomeEntry | null => log[0] ?? null);

/// How many commands landed on each outcome since the control channel opened. Every name is
/// present, so a reader never has to distinguish a zero from an absent key.
export const outcomeCounts = derived(outcomeLog, (log): Record<OutcomeName, number> =>
    log.reduce(
        (counts, entry) => ({ ...counts, [entry.outcome]: counts[entry.outcome] + 1 }),
        ZERO_COUNTS,
    ),
);
