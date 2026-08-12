import { describe, it, expect } from 'vitest';
import * as R from 'ramda';
import { CONDUITE } from './commandUtilities';

// The cue pointer lives in App.svelte's keydownHandler, which no test can drive without a
// component harness this project does not have. These tests assert the clamp expression the
// handler applies; they do not observe the handler itself.
const lastCueOf = (length: number) => Math.max(0, length - 1);
const step = (length: number) => R.clamp(0, lastCueOf(length));

// The four arrow keys move the pointer by +1 or -1, so any key sequence reduces to these.
const stepsFrom = (start: number, length: number, deltas: number[]): number[] =>
    R.scan((counter: number, delta: number) => step(length)(counter + delta), start, deltas);

describe('cue pointer clamp', () => {
    const cues = CONDUITE.sequence;

    it('holds the pointer inside the cue sheet for a long alternating key sequence', () => {
        const deltas = R.times((i) => (i % 3 === 0 ? -1 : 1), 500);
        const visited = stepsFrom(0, cues.length, deltas);
        visited.forEach((counter) => {
            expect(counter).toBeGreaterThanOrEqual(0);
            expect(counter).toBeLessThanOrEqual(cues.length - 1);
        });
    });

    it('holds the pointer inside the cue sheet for randomised key sequences', () => {
        const deltas = R.times(() => (Math.random() < 0.5 ? -1 : 1), 2000);
        const visited = stepsFrom(0, cues.length, deltas);
        expect(Math.min(...visited)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...visited)).toBeLessThanOrEqual(cues.length - 1);
    });

    it('never lands on an index that reads undefined out of the cue sheet', () => {
        const deltas = R.times(() => 1, cues.length + 50);
        const visited = stepsFrom(0, cues.length, deltas);
        visited.forEach((counter) => {
            expect(cues[counter]).toBeDefined();
        });
    });

    it('stops at the last cue when the pointer is driven past the end', () => {
        const pastTheEnd = stepsFrom(0, cues.length, R.times(() => 1, cues.length + 10));
        expect(R.last(pastTheEnd)).toBe(cues.length - 1);
    });

    it('stops at the first cue when the pointer is driven before the start', () => {
        const beforeTheStart = stepsFrom(0, cues.length, R.times(() => -1, 10));
        expect(R.last(beforeTheStart)).toBe(0);
    });

    it('bounds the pointer one below the length, since a length bound admits the empty slot', () => {
        expect(step(cues.length)(cues.length)).toBe(cues.length - 1);
        expect(R.clamp(0, cues.length)(cues.length)).toBe(cues.length);
        expect(cues[cues.length]).toBeUndefined();
    });

    it('does not throw for an empty cue sheet, which R.clamp rejects without the 0 floor', () => {
        expect(() => step(0)(1)).not.toThrow();
        expect(step(0)(1)).toBe(0);
        expect(() => R.clamp(0, -1)(1)).toThrow();
    });
});
