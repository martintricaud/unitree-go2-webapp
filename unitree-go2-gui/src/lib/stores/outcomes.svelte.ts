import { constant, countBy, first, fromKeys, prop, take } from 'remeda';
import { toStore } from 'svelte/store';
import type { Updater, Writable } from 'svelte/store';

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

/// The outcomes of a robot's requests. The robot clears the log when its control channel opens.
export class OutcomeLog implements Pick<Writable<Outcome[]>, 'subscribe' | 'update'> {
    /// Newest first.
    entries = $state.raw<Outcome[]>([]);
    /// The newest entry, or null while the log is empty.
    last = $derived(first(this.entries) ?? null);
    /// The number of entries of each outcome. `countBy` omits an outcome no entry has, and `counts`
    /// gives it zero.
    #counted = $derived(countBy(this.entries, prop('outcome')));
    counts = $derived(fromKeys(OUTCOMES, (_name) => this.#counted[_name] ?? 0));
    subscribe;

    constructor() {
        // `toStore` reads the entries once on creation; the constructor runs after every field is set.
        this.subscribe = toStore(() => this.entries).subscribe;
    }

    /// An arrow function, so a caller may pass it detached from the object, as `Writable` allows.
    update = (_change: Updater<Outcome[]>) => { this.entries = _change(this.entries); };

    /// Puts `_outcome` first; the oldest entries beyond `LOG_LIMIT` drop.
    record = (_outcome: Outcome) => this.update((_log) => take([_outcome, ..._log], LOG_LIMIT));

    clear = () => this.update(constant([]));
}

/// The app's log, which the app's robot writes.
export const outcomeLog = new OutcomeLog();
