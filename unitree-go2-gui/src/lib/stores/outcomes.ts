import { derived, writable } from 'svelte/store';
import type { OutcomeEntry, OutcomeName } from '../utils/outcome';

/// Matches the relay's own result buffer, so neither side keeps a longer history than the other.
const LOG_LIMIT = 200;

const ZERO_COUNTS: Record<OutcomeName, number> = {
    confirmed: 0,
    failed: 0,
    rejected: 0,
    unknown: 0,
};

/// Every outcome since the control channel opened, newest first.
export const outcomeLog = writable<OutcomeEntry[]>([]);

export function recordOutcome(_entry: OutcomeEntry) {
    outcomeLog.update(function (_log) {
        return [_entry, ..._log].slice(0, LOG_LIMIT);
    });
}

/// Empty the log. The counts are per connection, so they start again with the channel.
export function clearOutcomes() {
    outcomeLog.set([]);
}

/// The newest outcome, or null while the log is empty.
export const lastOutcome = derived(outcomeLog, (_log) => _log.at(0) ?? null);

/// How many commands landed on each outcome since the control channel opened. Every name is
/// present, so a reader never has to distinguish a zero from an absent key.
export const outcomeCounts = derived(outcomeLog, function (_log) {
    return _log.reduce(
        (_counts, _entry) => ({ ..._counts, [_entry.outcome]: _counts[_entry.outcome] + 1 }),
        ZERO_COUNTS,
    );
});
