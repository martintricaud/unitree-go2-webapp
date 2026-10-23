import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { confirmable, displayed } from './confirmable';
import type { Outcome } from '../stores/outcomes';

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

describe('what the control shows', () => {
    it('shows the value it was created with while nothing has been asked for', () => {
        const state = confirmable(START);
        expect(displayed(get(state))).toEqual(START);
        expect(get(state)).toEqual({ settled: START, pending: {} });
    });

    it("shows the operator's choice from the moment it is proposed, before any verdict", () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 1);
        expect(displayed(get(state))).toEqual({ ...START, mode: 'Pose' });
        expect(get(state).settled).toEqual(START);
        expect(get(state).pending).toEqual({ mode: { value: 'Pose', reqId: 1 } });
    });

    it('offers no way to write the value directly, so no caller can route around a verdict', () => {
        const state = confirmable(START);
        expect(Object.keys(state).sort()).toEqual(['observe', 'propose', 'resolve', 'subscribe']);
    });
});

describe('the verdict on a proposal', () => {
    it('settles the proposed fields when the robot confirms', () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose', headlight: 'red' }, 1);
        state.resolve(1, CONFIRMED);
        expect(get(state)).toEqual({
            settled: { ...START, mode: 'Pose', headlight: 'red' },
            pending: {},
        });
    });

    it.each([
        ['failed', FAILED],
        ['rejected', REJECTED],
        ['unknown', UNKNOWN],
    ])('leaves settled unchanged and drops the pending entry on %s', (_name, _outcome) => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 1);
        state.resolve(1, _outcome);
        expect(get(state)).toEqual({ settled: START, pending: {} });
        expect(displayed(get(state))).toEqual(START);
    });

    it('falls back to the last confirmed value, not to the last proposed one', () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 1);
        state.resolve(1, CONFIRMED);
        state.propose({ mode: 'Trotting' }, 2);
        state.resolve(2, FAILED);
        expect(displayed(get(state)).mode).toBe('Pose');
    });
});

describe('proposals on different fields', () => {
    it('stay pending side by side', () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 1);
        state.propose({ headlight: 'red' }, 2);
        expect(get(state).pending).toEqual({ mode: { value: 'Pose', reqId: 1 }, headlight: { value: 'red', reqId: 2 } });
        expect(displayed(get(state))).toEqual({ ...START, mode: 'Pose', headlight: 'red' });
    });

    it('are each settled only by their own verdict', () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 1);
        state.propose({ headlight: 'red' }, 2);

        state.resolve(2, CONFIRMED);
        expect(get(state).settled).toEqual({ ...START, headlight: 'red' });
        expect(get(state).pending).toEqual({ mode: { value: 'Pose', reqId: 1 } });

        state.resolve(1, FAILED);
        expect(get(state).settled).toEqual({ ...START, headlight: 'red' });
        expect(get(state).pending).toEqual({});
    });
});

describe('a second proposal on the same field', () => {
    it('replaces the earlier proposal for that field', () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 1);
        state.propose({ mode: 'Trotting' }, 2);
        expect(get(state).pending).toEqual({ mode: { value: 'Trotting', reqId: 2 } });
    });

    it("makes the earlier request's verdict change nothing", () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 1);
        state.propose({ mode: 'Trotting' }, 2);
        const before = get(state);

        state.resolve(1, CONFIRMED);

        expect(get(state)).toBe(before);
        expect(displayed(get(state)).mode).toBe('Trotting');
    });

    it('replaces only the fields it carries, so the earlier verdict still settles the others', () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose', headlight: 'red' }, 1);
        state.propose({ mode: 'Trotting' }, 2);

        state.resolve(1, CONFIRMED);

        expect(get(state).settled).toEqual({ ...START, headlight: 'red' });
        expect(get(state).pending.mode).toEqual({ value: 'Trotting', reqId: 2 });
    });
});

describe('a verdict that matches no pending field', () => {
    it('is the identity when the reqId matches nothing', () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 7);
        const before = get(state);
        state.resolve(6, FAILED);
        expect(get(state)).toBe(before);
    });

    it('is the identity when nothing is pending', () => {
        const state = confirmable(START);
        const before = get(state);
        state.resolve(1, CONFIRMED);
        expect(get(state)).toBe(before);
    });

    it('is the identity when the same request was already answered', () => {
        const state = confirmable(START);
        state.propose({ mode: 'Pose' }, 1);
        state.resolve(1, CONFIRMED);
        const before = get(state);
        state.resolve(1, FAILED);
        expect(get(state)).toBe(before);
    });
});

describe('subscribers', () => {
    it('see the proposal and the verdict as they happen', () => {
        const state = confirmable(START);
        const shown: string[] = [];
        const stop = state.subscribe((_state) => shown.push(displayed(_state).mode));

        state.propose({ mode: 'Pose' }, 1);
        state.resolve(1, FAILED);
        stop();

        expect(shown).toEqual(['FreeWalk', 'Pose', 'FreeWalk']);
    });
});

describe('a value the robot reports', () => {
    it('replaces the reported fields of the settled value and keeps the others', () => {
        const state = confirmable(START);
        state.observe({ speed: 1 });
        expect(get(state)).toEqual({ settled: { ...START, speed: 1 }, pending: {} });
    });

    it('leaves pending entries unchanged, so a pending value stays displayed', () => {
        const state = confirmable(START);
        state.propose({ speed: 1, mode: 'Pose' }, 1);
        const { pending } = get(state);

        state.observe({ speed: -1, mode: 'Damp' });

        expect(get(state).pending).toBe(pending);
        expect(get(state).settled).toEqual({ ...START, speed: -1, mode: 'Damp' });
        expect(displayed(get(state))).toEqual({ ...START, speed: 1, mode: 'Pose' });
    });

    it('is what a refused proposal falls back to', () => {
        const state = confirmable(START);
        state.propose({ speed: 1 }, 1);
        state.observe({ speed: -1 });
        state.resolve(1, FAILED);
        expect(displayed(get(state)).speed).toBe(-1);
    });
});
