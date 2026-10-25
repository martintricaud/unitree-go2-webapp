import { presets } from './cues';
import type { robot } from '../stores/robot';

/// What each key does: fire or move the cue sheet by `steps`, run `toggle` on the robot, or send
/// `cue` as it is. `label` names the binding for the operator.
export const KEY_BINDINGS = {
    ArrowRight: { kind: 'fire', steps: 1, label: 'Fire, then next cue' },
    ArrowLeft: { kind: 'fire', steps: -1, label: 'Fire, then previous cue' },
    ArrowDown: { kind: 'move', steps: 1, label: 'Next cue' },
    ArrowUp: { kind: 'move', steps: -1, label: 'Previous cue' },
    Enter: { kind: 'fire', steps: 0, label: 'Fire' },
    a: { kind: 'toggle', toggle: (_robot: typeof robot) => _robot.togglePosture('Pose'), label: 'Toggle Pose' },
    b: { kind: 'toggle', toggle: (_robot: typeof robot) => _robot.toggleGait('Leaping'), label: 'Toggle Leaping' },
    x: { kind: 'toggle', toggle: (_robot: typeof robot) => _robot.togglePosture('Sitting'), label: 'Toggle Sit' },
    y: { kind: 'send', cue: presets.dance, label: 'Dance' },
} as const;
