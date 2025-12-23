export function speedChangeMessage(speedLevel: 'Slow' | 'Normal' | 'Fast') {
    let sendSpeedLevel: number;
        switch (speedLevel) {
            case 'Slow':
                sendSpeedLevel = -1;
                break;
            case 'Normal':
                sendSpeedLevel = 0;
                break;
            case 'Fast':
                sendSpeedLevel = 1;
                break;
        }
    return { command_name: 'SpeedLevel', api_code:1015, parameter: { data: sendSpeedLevel } };

}

export function booleanMessage(_command_name:string, _flag:boolean){
    let flagToInt = _flag?1:0
    return { command_name: _command_name, parameter: { flag: flagToInt } };
}
export function gaitChangeMessage(gait: 'Idle'
            | 'Trot'
            | 'Running'
            | 'Forward Climb'
            | 'Reverse Climb') {
    let sendGait: number;
        switch (gait) {
            case 'Idle':
                sendGait = 0;
                break;
            case 'Trot':
                sendGait = 1;
                break;
            case 'Running':
                sendGait = 2;
                break;
            case 'Forward Climb':
                sendGait = 3;
                break;
            case 'Reverse Climb':
                sendGait = 4;
                break;
        }
    return { command_name: 'SwitchGait', api_code: 1011, parameter: { d: sendGait } };
}
