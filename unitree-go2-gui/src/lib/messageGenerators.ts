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
    return { api_id: 'SpeedLevel', command: 'SpeedLevel', parameter: { level: sendSpeedLevel } };

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
    return { api_id: 'SwitchGait', command: 'SwitchGait', parameter: { d: sendGait } };
}
