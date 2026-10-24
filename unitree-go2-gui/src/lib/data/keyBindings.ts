import { presets } from './cues';
import { toggleLeaping, togglePose, toggleSit } from '../utils/commands';

/// What each key does: fire or move the cue sheet by `steps`, send the cue `toggle` builds from the
/// robot state, or send `cue` as it is. A toggle returns null while its fields wait for a verdict.
export const KEY_BINDINGS = {
    ArrowRight: { kind: 'fire', steps: 1 },
    ArrowLeft: { kind: 'fire', steps: -1 },
    ArrowDown: { kind: 'move', steps: 1 },
    ArrowUp: { kind: 'move', steps: -1 },
    Enter: { kind: 'fire', steps: 0 },
    a: { kind: 'toggle', toggle: togglePose },
    b: { kind: 'toggle', toggle: toggleLeaping },
    x: { kind: 'toggle', toggle: toggleSit },
    y: { kind: 'send', cue: presets.dance },
} as const;
