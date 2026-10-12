import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { times } from 'remeda';
import { CONDUITE } from '../data/cues';
import { cuePointer } from './cuePointer';

const cues = CONDUITE.sequence;

/// The pointer has no setter, so a test returns it to the first cue the way the operator does:
/// by pressing left more times than the sheet is long.
const toFirstCue = () => cuePointer.moveBy(-cues.length);

/// Where the pointer lands after each of a run of arrow-key presses, each ±1.
const visit = (deltas: number[]): number[] =>
    deltas.map((delta) => {
        cuePointer.moveBy(delta);
        return get(cuePointer);
    });

describe('the cue pointer', () => {
    beforeEach(toFirstCue);

    it('starts on the first cue', () => {
        expect(get(cuePointer)).toBe(0);
    });

    it('stays inside the cue sheet through a long alternating key sequence', () => {
        const visited = visit(times(500, (i) => (i % 3 === 0 ? -1 : 1)));
        visited.forEach((at) => {
            expect(at).toBeGreaterThanOrEqual(0);
            expect(at).toBeLessThanOrEqual(cues.length - 1);
        });
    });

    it('stays inside the cue sheet through randomised key sequences', () => {
        const visited = visit(times(2000, () => (Math.random() < 0.5 ? -1 : 1)));
        expect(Math.min(...visited)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...visited)).toBeLessThanOrEqual(cues.length - 1);
    });

    it('never lands on an index that reads undefined out of the cue sheet', () => {
        visit(times(cues.length + 50, () => 1)).forEach((at) => {
            expect(cues[at]).toBeDefined();
        });
    });

    it('stops on the last cue when it is driven past the end', () => {
        visit(times(cues.length + 10, () => 1));
        expect(get(cuePointer)).toBe(cues.length - 1);
        expect(cues[get(cuePointer)]).toBeDefined();
    });

    it('stops on the first cue when it is driven before the start', () => {
        visit(times(10, () => -1));
        expect(get(cuePointer)).toBe(0);
    });

    it('holds one below the length, since the length itself is the empty slot past the end', () => {
        cuePointer.moveBy(cues.length);
        expect(get(cuePointer)).toBe(cues.length - 1);
        expect(cues[cues.length]).toBeUndefined();
    });

    it('does not move when it is asked for no steps', () => {
        cuePointer.moveBy(3);
        cuePointer.moveBy(0);
        expect(get(cuePointer)).toBe(3);
    });
});
