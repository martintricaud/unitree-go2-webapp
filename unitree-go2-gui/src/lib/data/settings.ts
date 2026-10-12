/// The commands that set one field of the robot state. `argument` names the parameter that
/// carries the value; the robot reads the speed under `data`.
export const SETTINGS = {
    headlight: {
        command_name: 'Headlight',
        topic: 'VUI',
        api_id: 1007,
        argument: 'color',
        description: 'Changes the headlight state with the provided parameters',
    },
    speed: {
        command_name: 'SpeedLevel',
        topic: 'SPORT_MOD',
        api_id: 1015,
        argument: 'data',
        description: '',
    },
    obstacleAvoidance: {
        command_name: 'ObstaclesAvoid',
        topic: 'OBSTACLES_AVOID',
        api_id: 1001,
        argument: 'enable',
        description: 'Turns obstacle avoidance on or off',
    },
} as const;

export const BRIGHTNESS = {
    command_name: 'Brightness',
    topic: 'VUI',
    api_id: 1005,
    argument: 'brightness',
    description: 'Changes the headlight state with the provided parameters',
} as const;

/// Takes roll, pitch and yaw as `x`, `y` and `z`, as in Unitree's SDK.
export const EULER = { command_name: 'Euler', topic: 'SPORT_MOD', api_id: 1007, description: '' } as const;
