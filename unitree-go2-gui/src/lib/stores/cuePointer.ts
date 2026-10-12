import { clamp } from 'remeda';
import { writable } from 'svelte/store';
import { CONDUITE } from '../data/cues';

/// The last index that holds a cue. The 0 floor covers an empty cue sheet, whose last index
/// would otherwise be -1.
const LAST_CUE = Math.max(0, CONDUITE.length - 1);

const { subscribe, update } = writable(0);

/// Move the pointer by this many cues, never past either end of the sheet.
function moveBy(_steps: number) {
    update(function (_at) {
        return clamp(_at + _steps, { min: 0, max: LAST_CUE });
    });
}

/// Where the operator stands in the cue sheet. The pointer is bounded to an index that holds a
/// cue, so reading CONDUITE at it never yields undefined.
export const cuePointer = { subscribe, moveBy };
