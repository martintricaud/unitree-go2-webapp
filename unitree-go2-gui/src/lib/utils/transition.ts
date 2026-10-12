import { reduce } from 'remeda';
import { ACTIONS } from '../data/actions';
import type { RobotState } from '../data/robotState';
import type { Cue } from './commands';

/// The state the robot is in once the cue has run from `_state`.
export function transition(_cue: Cue): (_state: RobotState) => RobotState {
    return function (_state) {
        switch (_cue.kind) {
            case 'enter':
                return { ..._state, mode: _cue.mode };
            case 'leave':
                return { ..._state, mode: null };
            case 'perform': {
                const action = ACTIONS[_cue.action];
                return 'posture' in action ? { ..._state, posture: action.posture } : _state;
            }
            case 'set':
                return { ..._state, [_cue.setting.name]: _cue.setting.value };
            case 'orient':
            case 'dim':
            case 'wait':
                return _state;
            case 'sequence':
                return reduce(_cue.items, (_reached, _item) => transition(_item)(_reached), _state);
        }
    };
}
