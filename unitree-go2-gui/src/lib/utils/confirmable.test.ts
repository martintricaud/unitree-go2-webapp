import { describe, expect, it } from 'vitest';
import { pipe } from 'remeda';
import * as confirmable from './confirmable';
import { displayed } from './confirmable';
import type { Confirmable } from './confirmable';
import type { Outcome } from '../stores/outcomes.svelte';

const verdict = (_outcome: Outcome['outcome']): Outcome => ({
    reqId: 0,
    label: '',
    at: 0,
    outcome: _outcome,
    code: null,
    detail: '',
});
const CONFIRMED = verdict('confirmed');
const FAILED = verdict('failed');
const REJECTED = verdict('rejected');
const UNKNOWN = verdict('unknown');

const START = { mode: 'FreeWalk', headlight: 'green', speed: 0 };
const INITIAL: Confirmable<typeof START> = { settled: START, pending: {} };

// Fixed to START's fields, so each step in a `pipe` keeps every field's type.
const propose = confirmable.propose<typeof START>;
const resolve = confirmable.resolve<typeof START>;
const settle = confirmable.settle<typeof START>;

describe('what the control shows', () => {
    it('shows the settled value while nothing has been asked for', () => {
        expect(displayed(INITIAL)).toEqual(START);
    });

    it("shows the operator's choice from the moment it is proposed, before any verdict", () => {
        const state = propose({ mode: 'Pose' }, 1)(INITIAL);
        expect(displayed(state)).toEqual({ ...START, mode: 'Pose' });
        expect(state.settled).toEqual(START);
        expect(state.pending).toEqual({ mode: { value: 'Pose', reqId: 1 } });
    });

    it('offers no way to write the value directly, so no caller can route around a verdict', () => {
        expect(Object.keys(confirmable).sort()).toEqual(['displayed', 'propose', 'resolve', 'settle']);
    });
});

describe('the verdict on a proposal', () => {
    it('settles the proposed fields when the robot confirms', () => {
        const state = pipe(INITIAL, propose({ mode: 'Pose', headlight: 'red' }, 1), resolve(1, CONFIRMED));
        expect(state).toEqual({
            settled: { ...START, mode: 'Pose', headlight: 'red' },
            pending: {},
        });
    });

    it.each([
        ['failed', FAILED],
        ['rejected', REJECTED],
        ['unknown', UNKNOWN],
    ])('leaves settled unchanged and drops the pending entry on %s', (_name, _outcome) => {
        const state = pipe(INITIAL, propose({ mode: 'Pose' }, 1), resolve(1, _outcome));
        expect(state).toEqual({ settled: START, pending: {} });
        expect(displayed(state)).toEqual(START);
    });

    it('falls back to the last confirmed value, not to the last proposed one', () => {
        const state = pipe(
            INITIAL,
            propose({ mode: 'Pose' }, 1),
            resolve(1, CONFIRMED),
            propose({ mode: 'Running' }, 2),
            resolve(2, FAILED),
        );
        expect(displayed(state).mode).toBe('Pose');
    });
});

describe('proposals on different fields', () => {
    it('stay pending side by side', () => {
        const state = pipe(INITIAL, propose({ mode: 'Pose' }, 1), propose({ headlight: 'red' }, 2));
        expect(state.pending).toEqual({ mode: { value: 'Pose', reqId: 1 }, headlight: { value: 'red', reqId: 2 } });
        expect(displayed(state)).toEqual({ ...START, mode: 'Pose', headlight: 'red' });
    });

    it('are each settled only by their own verdict', () => {
        const proposed = pipe(INITIAL, propose({ mode: 'Pose' }, 1), propose({ headlight: 'red' }, 2));

        const second = resolve(2, CONFIRMED)(proposed);
        expect(second.settled).toEqual({ ...START, headlight: 'red' });
        expect(second.pending).toEqual({ mode: { value: 'Pose', reqId: 1 } });

        const first = resolve(1, FAILED)(second);
        expect(first.settled).toEqual({ ...START, headlight: 'red' });
        expect(first.pending).toEqual({});
    });
});

describe('a second proposal on the same field', () => {
    it('replaces the earlier proposal for that field', () => {
        const state = pipe(INITIAL, propose({ mode: 'Pose' }, 1), propose({ mode: 'Running' }, 2));
        expect(state.pending).toEqual({ mode: { value: 'Running', reqId: 2 } });
    });

    it("makes the earlier request's verdict change nothing", () => {
        const before = pipe(INITIAL, propose({ mode: 'Pose' }, 1), propose({ mode: 'Running' }, 2));

        const after = resolve(1, CONFIRMED)(before);

        expect(after).toBe(before);
        expect(displayed(after).mode).toBe('Running');
    });

    it('replaces only the fields it carries, so the earlier verdict still settles the others', () => {
        const state = pipe(
            INITIAL,
            propose({ mode: 'Pose', headlight: 'red' }, 1),
            propose({ mode: 'Running' }, 2),
            resolve(1, CONFIRMED),
        );

        expect(state.settled).toEqual({ ...START, headlight: 'red' });
        expect(state.pending.mode).toEqual({ value: 'Running', reqId: 2 });
    });
});

describe('a verdict that matches no pending field', () => {
    it('is the identity when the reqId matches nothing', () => {
        const before = propose({ mode: 'Pose' }, 7)(INITIAL);
        expect(resolve(6, FAILED)(before)).toBe(before);
    });

    it('is the identity when nothing is pending', () => {
        expect(resolve(1, CONFIRMED)(INITIAL)).toBe(INITIAL);
    });

    it('is the identity when the same request was already answered', () => {
        const before = pipe(INITIAL, propose({ mode: 'Pose' }, 1), resolve(1, CONFIRMED));
        expect(resolve(1, FAILED)(before)).toBe(before);
    });
});

describe('each step', () => {
    it('returns the state after it and leaves the state before it unchanged', () => {
        const proposed = propose({ mode: 'Pose' }, 1)(INITIAL);
        const answered = resolve(1, FAILED)(proposed);

        expect([INITIAL, proposed, answered].map((_state) => displayed(_state).mode)).toEqual([
            'FreeWalk',
            'Pose',
            'FreeWalk',
        ]);
        expect(INITIAL).toEqual({ settled: START, pending: {} });
        expect(proposed.pending).toEqual({ mode: { value: 'Pose', reqId: 1 } });
    });
});

describe('a value the robot reports', () => {
    it('replaces the reported fields of the settled value and keeps the others', () => {
        expect(settle({ speed: 1 })(INITIAL)).toEqual({ settled: { ...START, speed: 1 }, pending: {} });
    });

    it('leaves pending entries unchanged, so a pending value stays displayed', () => {
        const proposed = propose({ speed: 1, mode: 'Pose' }, 1)(INITIAL);

        const state = settle({ speed: -1, mode: 'Damp' })(proposed);

        expect(state.pending).toBe(proposed.pending);
        expect(state.settled).toEqual({ ...START, speed: -1, mode: 'Damp' });
        expect(displayed(state)).toEqual({ ...START, speed: 1, mode: 'Pose' });
    });

    it('is what a refused proposal falls back to', () => {
        const state = pipe(INITIAL, propose({ speed: 1 }, 1), settle({ speed: -1 }), resolve(1, FAILED));
        expect(displayed(state).speed).toBe(-1);
    });
});
