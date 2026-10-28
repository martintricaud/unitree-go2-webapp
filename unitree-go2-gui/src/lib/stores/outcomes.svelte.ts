import { concat, constant, countBy, first, fromKeys, prop, set, take } from 'remeda';
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

/// The one-line text of a verdict: the request's label, the outcome, and the robot's code if any.
export const summary = ({ label, outcome, code }: Pick<Outcome, 'label' | 'outcome' | 'code'>) =>
    `${label} ${outcome}${code === null ? '' : ` (${code})`}`;

/// `sent`: a message the browser sent to the relay. `received`: a message the relay sent, except
/// the robot's raw state stream. `stream`: one message of that stream.
export const KINDS = ['sent', 'received', 'stream'] as const;
type Kind = (typeof KINDS)[number];

/// The list each kind of message is kept in: the most entries it holds, and its filter's label.
/// The stream sends 20 to 50 messages per second, so its own limit keeps it from pushing the
/// other kinds out of the log. With 1000 stream messages listed and 50 more each second, the open
/// popover drew no frame longer than 50 ms; with 5000 it drew frames of up to 100 ms.
export const LISTS: Record<Kind, { limit: number; label: string }> = {
    sent: { limit: LOG_LIMIT, label: 'Sent' },
    received: { limit: LOG_LIMIT, label: 'Received' },
    stream: { limit: 1000, label: 'Stream' },
};

/// One message: when it was logged, a one-line summary, and the whole message as `detail`.
type Message = { kind: Kind; at: number; summary: string; detail: string };

const NO_MESSAGES = fromKeys(KINDS, constant<Message[]>([]));

/// The outcomes of a robot's requests, and every message the robot exchanged with the relay. The
/// robot clears the log when its control channel opens.
export class OutcomeLog implements Pick<Writable<Outcome[]>, 'update'> {
    /// Newest first.
    entries = $state.raw<Outcome[]>([]);
    /// The newest entry, or null while the log is empty.
    last = $derived(first(this.entries) ?? null);
    /// The number of entries of each outcome. `countBy` omits an outcome no entry has, and `counts`
    /// gives it zero.
    #counted = $derived(countBy(this.entries, prop('outcome')));
    counts = $derived(fromKeys(OUTCOMES, (_name) => this.#counted[_name] ?? 0));
    /// The messages of each kind, newest first. Apart from `entries`, so that a message does not
    /// make `last` and `counts` recompute.
    messages = $state.raw(NO_MESSAGES);

    /// An arrow function, so a caller may pass it detached from the object, as `Writable` allows.
    update = (_change: Updater<Outcome[]>) => { this.entries = _change(this.entries); };

    /// Puts `_outcome` first; the oldest entries beyond `LOG_LIMIT` drop. Returns `_outcome`.
    record = (_outcome: Outcome) => {
        this.update((_log) => take([_outcome, ..._log], LOG_LIMIT));
        return _outcome;
    };

    /// Puts a message of `_kind` first in its list, timed now; the oldest beyond the kind's limit drop.
    note = (_kind: Kind, _summary: string, _detail: string) => {
        const message = { kind: _kind, at: Date.now(), summary: _summary, detail: _detail };
        this.messages = set(this.messages, _kind, take(concat([message], this.messages[_kind]), LISTS[_kind].limit));
    };

    clear = () => {
        this.update(constant([]));
        this.messages = NO_MESSAGES;
    };
}

/// The app's log, which the app's robot writes.
export const outcomeLog = new OutcomeLog();
