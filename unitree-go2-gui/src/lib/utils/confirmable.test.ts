import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { confirmable, displayed, fieldStatus } from './confirmable';
import type { Outcome } from '../stores/outcomes';

const REQUEST = { reqId: 1, label: 'Pose', at: 0 };
const CONFIRMED: Outcome = { ...REQUEST, outcome: 'confirmed', code: 0, detail: '' };
const FAILED: Outcome = { ...REQUEST, outcome: 'failed', code: 3203, detail: 'status.code=3203' };
const REJECTED: Outcome = { ...REQUEST, outcome: 'rejected', code: null, detail: 'the bridge refused it' };
const UNKNOWN: Outcome = { ...REQUEST, outcome: 'unknown', code: null, detail: 'no reply within 5s' };

describe('what the control shows', () => {
    it('shows the value it was created with while nothing has been asked for', () => {
        const mode = confirmable('FreeWalk');
        expect(displayed(get(mode))).toBe('FreeWalk');
        expect(get(mode)).toEqual({ settled: 'FreeWalk', pending: null, lastAttempt: null });
    });

    it("shows the operator's choice from the moment it is proposed, before any verdict", () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        expect(displayed(get(mode))).toBe('Pose');
        expect(get(mode).settled).toBe('FreeWalk');
        expect(get(mode).lastAttempt).toBeNull();
    });

    it('shows the newer of two proposals made before either was answered', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.propose('Trotting', 2);
        expect(displayed(get(mode))).toBe('Trotting');
        expect(get(mode).pending).toEqual({ proposed: 'Trotting', reqId: 2 });
    });

    it('offers no way to write the value directly, so no caller can route around a verdict', () => {
        const mode = confirmable('FreeWalk');
        expect('set' in mode).toBe(false);
        expect('update' in mode).toBe(false);
        expect(Object.keys(mode).sort()).toEqual(['observe', 'propose', 'resolve', 'subscribe']);
    });
});

describe('a verdict on the value the control proposed', () => {
    it('settles the displayed value and clears pending when the robot confirms', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.resolve(1, CONFIRMED);
        expect(get(mode)).toEqual({
            settled: 'Pose',
            pending: null,
            lastAttempt: { from: 'FreeWalk', proposed: 'Pose', outcome: CONFIRMED },
        });
        expect(displayed(get(mode))).toBe('Pose');
    });

    it('restores the value the control held before the click when the robot refuses', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        expect(displayed(get(mode))).toBe('Pose');

        mode.resolve(1, FAILED);
        expect(displayed(get(mode))).toBe('FreeWalk');
        expect(get(mode)).toEqual({
            settled: 'FreeWalk',
            pending: null,
            lastAttempt: { from: 'FreeWalk', proposed: 'Pose', outcome: FAILED },
        });
    });

    it('reverts on a rejection from the bridge on the same terms as a refusal', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.resolve(1, REJECTED);
        expect(displayed(get(mode))).toBe('FreeWalk');
        expect(get(mode)).toEqual({
            settled: 'FreeWalk',
            pending: null,
            lastAttempt: { from: 'FreeWalk', proposed: 'Pose', outcome: REJECTED },
        });
    });

    it('keeps the attempted value and marks it unconfirmed when nothing came back', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.resolve(1, UNKNOWN);
        expect(displayed(get(mode))).toBe('Pose');
        expect(get(mode).settled).toBe('Pose');
        expect(get(mode).pending).toBeNull();
        expect(get(mode).lastAttempt).toEqual({ from: 'FreeWalk', proposed: 'Pose', outcome: UNKNOWN });
    });

    it('reverts to the last confirmed value, not to the last proposed one', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.resolve(1, CONFIRMED);
        mode.propose('Trotting', 2);
        mode.resolve(2, FAILED);
        expect(displayed(get(mode))).toBe('Pose');
    });

    it('leaves the control ready for the next proposal after a refusal', () => {
        const sitting = confirmable(false);
        sitting.propose(true, 1);
        sitting.resolve(1, FAILED);
        sitting.propose(true, 2);
        sitting.resolve(2, CONFIRMED);
        expect(displayed(get(sitting))).toBe(true);
    });
});

describe('a verdict on a request the control is no longer waiting on', () => {
    it('leaves the whole state untouched when the reqId matches nothing', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 7);
        const before = get(mode);

        mode.resolve(6, FAILED);

        expect(get(mode)).toEqual(before);
        // Identical, not merely equal: the verdict acted on the state as the identity.
        expect(get(mode)).toBe(before);
    });

    it('leaves the whole state untouched when the control is waiting on nothing at all', () => {
        const mode = confirmable('FreeWalk');
        const before = get(mode);
        mode.resolve(1, CONFIRMED);
        expect(get(mode)).toBe(before);
    });

    it('ignores a verdict that arrives after the same request was already answered', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.resolve(1, CONFIRMED);
        const settledState = get(mode);

        mode.resolve(1, FAILED);

        expect(get(mode)).toBe(settledState);
        expect(displayed(get(mode))).toBe('Pose');
    });

    it("settles on the later request's result when two verdicts arrive out of order", () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.propose('Trotting', 2);

        mode.resolve(2, CONFIRMED);
        mode.resolve(1, FAILED);

        expect(displayed(get(mode))).toBe('Trotting');
        expect(get(mode)).toEqual({
            settled: 'Trotting',
            pending: null,
            lastAttempt: { from: 'FreeWalk', proposed: 'Trotting', outcome: CONFIRMED },
        });
    });

    it("settles on the later request's result when the earlier verdict lands first", () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.propose('Trotting', 2);

        mode.resolve(1, CONFIRMED);
        mode.resolve(2, FAILED);

        expect(displayed(get(mode))).toBe('FreeWalk');
        expect(get(mode).lastAttempt?.outcome).toEqual(FAILED);
    });
});

describe('subscribers', () => {
    it('sees the proposal and the verdict as they happen', () => {
        const sitting = confirmable(false);
        const shown: boolean[] = [];
        const stop = sitting.subscribe((state) => shown.push(displayed(state)));

        sitting.propose(true, 1);
        sitting.resolve(1, FAILED);
        stop();

        expect(shown).toEqual([false, true, false]);
    });
});

describe('the status a control shows for one field', () => {
    const START = { mode: 'FreeWalk', headlight: 'white' };

    it('is pending only on the fields the pending proposal changes', () => {
        const state = confirmable(START);
        state.propose({ ...START, mode: 'Pose' }, 1);
        expect(fieldStatus(get(state), 'mode')).toBe('pending');
        expect(fieldStatus(get(state), 'headlight')).toBeNull();
    });

    it("carries the last attempt's verdict on the fields that attempt changed", () => {
        const state = confirmable(START);
        state.propose({ ...START, headlight: 'red' }, 1);
        state.resolve(1, FAILED);
        expect(fieldStatus(get(state), 'headlight')).toBe('failed');
        expect(fieldStatus(get(state), 'mode')).toBeNull();
    });

    it('is null for every field while nothing has been attempted', () => {
        const state = confirmable(START);
        expect(fieldStatus(get(state), 'mode')).toBeNull();
        expect(fieldStatus(get(state), 'headlight')).toBeNull();
    });
});

describe('a value the robot reports', () => {
    const START = { speed: 0, obstacleAvoidance: true };

    it('replaces the reported fields of the settled value and keeps the others', () => {
        const state = confirmable(START);
        state.observe({ speed: 1 });
        expect(get(state)).toEqual({
            settled: { speed: 1, obstacleAvoidance: true },
            pending: null,
            lastAttempt: null,
        });
    });

    it('leaves a pending proposal displayed until its verdict arrives', () => {
        const state = confirmable(START);
        state.propose({ ...START, obstacleAvoidance: false }, 1);
        const { pending } = get(state);

        state.observe({ speed: -1, obstacleAvoidance: true });

        expect(get(state).pending).toBe(pending);
        expect(get(state).settled).toEqual({ speed: -1, obstacleAvoidance: true });
        expect(displayed(get(state))).toEqual({ ...START, obstacleAvoidance: false });
    });

    it('leaves the last attempt untouched', () => {
        const state = confirmable(START);
        state.propose({ ...START, speed: 1 }, 1);
        state.resolve(1, FAILED);
        const { lastAttempt } = get(state);

        state.observe({ speed: -1 });

        expect(get(state).lastAttempt).toBe(lastAttempt);
        expect(get(state).settled.speed).toBe(-1);
    });

    it('is what a refused proposal reverts to', () => {
        const state = confirmable(START);
        state.propose({ ...START, obstacleAvoidance: false }, 1);
        state.observe({ speed: 1 });
        state.resolve(1, FAILED);
        expect(displayed(get(state))).toEqual({ speed: 1, obstacleAvoidance: true });
    });
});
