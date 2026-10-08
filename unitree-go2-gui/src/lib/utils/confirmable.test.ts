import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { confirmable, displayed } from './confirmable';
import type { Outcome } from './outcome';

const CONFIRMED: Outcome = { outcome: 'confirmed', code: 0, detail: null };
const FAILED: Outcome = { outcome: 'failed', code: 3203, detail: 'status.code=3203' };
const REJECTED: Outcome = { outcome: 'rejected', code: null, detail: 'the bridge refused it' };
const UNKNOWN: Outcome = { outcome: 'unknown', code: null, detail: 'no reply within 5s' };

describe('what the control shows', () => {
    it('shows the value it was created with while nothing has been asked for', () => {
        const mode = confirmable('FreeWalk');
        expect(displayed(get(mode))).toBe('FreeWalk');
        expect(get(mode)).toEqual({ settled: 'FreeWalk', pending: null, lastOutcome: null });
    });

    it("shows the operator's choice from the moment it is proposed, before any verdict", () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        expect(displayed(get(mode))).toBe('Pose');
        expect(get(mode).settled).toBe('FreeWalk');
        expect(get(mode).lastOutcome).toBeNull();
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
        expect(Object.keys(mode).sort()).toEqual(['propose', 'resolve', 'subscribe']);
    });
});

describe('a verdict on the value the control proposed', () => {
    it('settles the displayed value and clears pending when the robot confirms', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.resolve(1, CONFIRMED);
        expect(get(mode)).toEqual({ settled: 'Pose', pending: null, lastOutcome: CONFIRMED });
        expect(displayed(get(mode))).toBe('Pose');
    });

    it('restores the value the control held before the click when the robot refuses', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        expect(displayed(get(mode))).toBe('Pose');

        mode.resolve(1, FAILED);
        expect(displayed(get(mode))).toBe('FreeWalk');
        expect(get(mode)).toEqual({ settled: 'FreeWalk', pending: null, lastOutcome: FAILED });
    });

    it('reverts on a rejection from the bridge on the same terms as a refusal', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.resolve(1, REJECTED);
        expect(displayed(get(mode))).toBe('FreeWalk');
        expect(get(mode)).toEqual({ settled: 'FreeWalk', pending: null, lastOutcome: REJECTED });
    });

    it('keeps the attempted value and marks it unconfirmed when nothing came back', () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.resolve(1, UNKNOWN);
        expect(displayed(get(mode))).toBe('Pose');
        expect(get(mode).settled).toBe('Pose');
        expect(get(mode).pending).toBeNull();
        expect(get(mode).lastOutcome).toEqual(UNKNOWN);
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
        expect(get(mode)).toEqual({ settled: 'Trotting', pending: null, lastOutcome: CONFIRMED });
    });

    it("settles on the later request's result when the earlier verdict lands first", () => {
        const mode = confirmable('FreeWalk');
        mode.propose('Pose', 1);
        mode.propose('Trotting', 2);

        mode.resolve(1, CONFIRMED);
        mode.resolve(2, FAILED);

        expect(displayed(get(mode))).toBe('FreeWalk');
        expect(get(mode).lastOutcome).toEqual(FAILED);
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
