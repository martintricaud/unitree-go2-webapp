import { presets } from './cues';
import { toggleLeaping, togglePose, toggleSit } from '../utils/commands';

/// What each key does: fire or move the cue sheet by `steps`, send the cue `toggle` builds from the
/// robot state, or send `cue` as it is. A toggle returns null while its fields wait for a verdict.
/// `label` names the binding for the operator.
export const KEY_BINDINGS = {
    ArrowRight: { kind: 'fire', steps: 1, label: 'Fire, then next cue' },
    ArrowLeft: { kind: 'fire', steps: -1, label: 'Fire, then previous cue' },
    ArrowDown: { kind: 'move', steps: 1, label: 'Next cue' },
    ArrowUp: { kind: 'move', steps: -1, label: 'Previous cue' },
    Enter: { kind: 'fire', steps: 0, label: 'Fire' },
    a: { kind: 'toggle', toggle: togglePose, label: 'Toggle Pose' },
    b: { kind: 'toggle', toggle: toggleLeaping, label: 'Toggle Leaping' },
    x: { kind: 'toggle', toggle: toggleSit, label: 'Toggle Sit' },
    y: { kind: 'send', cue: presets.dance, label: 'Dance' },
} as const;
