import asyncio
import json
from functools import reduce

# Small utility function that applies a binary operation cumulatively to a list
def cumulative_reduce(list, op):
    return [reduce(op, list[:i+1]) for i in range(len(list))]

def addDelta(p1, delta):
    return {
        "t_from_start": p1["t_from_start"] + delta["t_from_start"],
        "x": p1["x"] + delta["x"],
        "y": p1["y"] + delta["y"],
        "yaw": p1["yaw"] + delta["yaw"],
        "vx": p1["vx"] + delta["vx"],
        "vy": p1["vy"] + delta["vy"],
        "vyaw": p1["vyaw"] + delta["vyaw"]
    }

trajectory_steps = [
    {
        "t_from_start": 0.0,
        "x": 1.0,
        "y": 0.0,
        "yaw": 0.0,
        "vx": 0.0,
        "vy": 0.0,
        "vyaw": 0.0
    },{
        "name": "delta_halfSpinLeft",
        "t_from_start": 2.0,
        "x": 0.0,
        "y": 0.0,
        "yaw": 3.14,
        "vx": 0.0,
        "vy": 0.0,
        "vyaw": 0.0
    },{
        "name": "delta_halfSpinRight",
        "t_from_start": 1.0,
        "x": 0.0,   
        "y": 0.0,
        "yaw": -3.14,
        "vx": 0.0,
        "vy": 0.0,
        "vyaw": 0.0
    },{
        "name": "delta_arc",
        "t_from_start": 2.0,
        "x": 0.0,
        "y": 0.0,
        "yaw": 0.0,
        "vx": 0.0,
        "vy": 0.0,
        "vyaw": 0.0
    }
]

action_sequence = [
    {
        "description": "Follow trajectory",
        "topic": "SPORT_MOD",
        "api_id": 1018,
        "parameter": json.dumps(cumulative_reduce(trajectory_steps, addDelta)),
        "delay": 0
    }
    # {
    #     "description": "Stretch",
    #     "topic": "SPORT_MOD",
    #     "api_id": 1017,
    #     "parameter": {},
    #     "delay": 3
    # },
    # {
    #     "description": "Hello",
    #     "topic": "SPORT_MOD",
    #     "api_id": 1016,
    #     "parameter": {},
    #     "delay": 3
    # },
    # {
    #     "description": "Front Jump",
    #     "topic": "SPORT_MOD",
    #     "api_id": 1004,
    #     "parameter": {},
    #     "delay": 3
    # }
]



def DefineArc(arcCenterX: float, arcCenterY: float, arcRadius: float, arcAngle: float, speed: float):
    return 0 

