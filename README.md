# unitree-go2-webapp

## Folder structure

```
unitree_webapp/
├─ backend/
│  ├─ main.py          # FastAPI backend
│  └─ robot_client.py  # WebRTC connection wrapper
└─ unitree-go2-gui/
   ├─ src/
   │  ├─ App.svelte   # main Svelte component
   │  └─ XYPad.svelte # elastic XY pad component
   └─ package.json
```

## Dependencies
To communicate with the Go2, the backend relies on a Python implementation of a WebRTC driver.
Currently the latest version supported is 1.1.8 (available on the 2.x.x branch of the go2_webrtc_connect repo)

## Troubleshooting

```nc -vz 192.168.3.164 8081```
```nc -vz 192.168.3.164 9991```
```arp -a```
```ping -c 4 -S 192.168.3.164```
## Startup instructions

Warning: Homebrew tends to mess with python virtual environments, so install and launch python packages using the explicit executable's path within the venv
launch the server with ```venv/bin/uvicorn main:app --reload```

If connecting in AP (access point mode) the IP of the Go2 is 192.168.12.1
If connecting in STA-L (i.e. connected over a shared router), the IP of the Go2 is 192.168.123.161

## List of API methods:

method|parameters|ai|normal|resulting mode|  
|---|---|---|---|---|
|Damp|None|✅|✅|
|BalanceStand|None|✅|✅||
|StopMove|None|✅|✅||
|StandUp|None|✅|✅||
|StandDown|None|✅|✅||
|RecoveryStand|None|✅|✅||
|Euler|<float,float,float>|❌|✅||
|Move|<float,float,float>|✅|✅||
|Sit|None|❌|✅|||
|RiseSit|None|❌|✅|||
|SwitchGait|Enum<Int>|❌|✅||
|BodyHeight|float|❌|✅||
|FootRaiseHeight|float|❌|✅||
|SpeedLevel|Enum<Int>|✅|✅||
|Stretch|None|❌|✅||
|Stretch|None|❌|✅||
|ContinuousGait|bool|✅|✅||
|MoveToPos||✅||
|HandStand||✅||
|FrontFlip|None|✅|✅|
|SwitchMoveMode|Bool|✅|❌|ContinuousResponseMode|
|TrajectoryFollow|Vec30<Point>|✅|✅|
|SwitchJoystick|bool|❌|✅|
|Wallow|None|❌|✅|
|LeftFlip|None|✅|❌|Agile|
|Pose|bool|❌|✅|
|Scrape|None|❌|✅|
|BackFlip|None|✅|❌|Agile|
|FreeWalk|None|✅|❌|Agile|
|FreeBound|Bool|✅|❌|Bound Run|
|FreeJump|Bool|✅|❌|Jump|
|FreeAvoid|Bool|✅|❌|Avoid|
|WalkStair|Bool|✅|❌|
|WalkUpright||✅|❌|
|CrossStep||✅|❌|
|FrontJump|None|❌|✅|
|FrontPounce|None|❌|✅|
|Dance1|None|❌|✅|
|Dance2|None|❌|✅|


### Notes

Since the latest firmware update (august 2025) the driver is outdated: there are no more AI mode and Sports mode, so don't upgrade above 1.1.8 for now

Only one WebRTC connection can be open at a time, so if the app is connected then the webapp cannot connect

In AI mode controls are going through "rt/wirelesscontroller" topic. Fix the API calls accordingly.

Apparently Euler angles can only be changed in Pose mode (and cannot be "frozen")

After calling "Damp", the robot will not move until BalanceStand has been called

The Euler is not the same in Classic and Normal mode

FreeWalk in AI mode is the most nervous mode and natural (no parasite steps)
### DUMP

Cursor prompts for later:

create a svelte component called ToolPalette
ToolPalette is a circular/marking menu that is toggle by holding the spacebar, and vanishes when spacebar is released.
The options in the menu should be declared in an object called toolList, and displayed in a circle whose center is the position of the mouse when the spacebar was pressed.
When the marking menu is active, 


### SPECIAL FUNCTIONS

Left flip code: 1c3a64

### MORE DOCS AND RESOURCES

https://mmwaves.de/blogs/go2-actions/

### LATEST COMMIT

Scratches the video stream subscription feature and adds audio file playback controls

Scratches the AI suggested solution to subscribe to the video stream.
The MediaRelay from aiortc seems to be the way to go, but the proposed implementation seem overengineered and poorly refactored, judging by the sheer number of ad-hoc control structures.
Maybe I have a functional programming bias, but this seems like a nightmare to maintain.
Subscribing to the videostream is not a priority feature anyways.


## Notes on using Cursor:

Scope pollution inside App.svelte. 
Svelte instantiates global variable in the component scope that should actually be module-scoped singletons.


Préparation et entrée du chien:
- il fait bcp de bruit meme couché. ET il ne peut pas être allumé depuis la scène. (Éventuellement desactiver le Lidar)

method|parameters|ai|normal|resulting mode|  
|---|---|---|---|---|
|Damp||✅|✅|
|Balance Stand||✅|✅|
|StopMove||✅|✅|
|Stand Up||✅|✅|
|Stand Down / Crouch|None|✅|✅|
|Recovery Stand|None|✅|✅|
|Pose||❌|✅|
|Control Pitch Angle while Moving||❌|✅|
|Move||✅|✅||
|Sit|None|❌|✅|||
|Rise from sitting position|None|❌|✅|||
|Stretch||❌|✅||
|HandStand||✅|❌|
|FrontFlip|None|✅|✅|
|Wallow / Roll over||❌|✅|
|LeftFlip||✅|❌||
|Scrape||❌|✅|
|BackFlip||❌|❌|Agile|
|FreeWalk||✅|❌|Agile|
|FreeBound||✅|❌|Bound Run|
|FreeJump||✅|❌|Jump|
|FreeAvoid|Bool|✅|❌|Avoid|
|WalkStair|Bool|✅|❌|
|WalkUpright||✅|❌|
|CrossStep||✅|❌|
|FrontJump|None|❌|✅|
|Pounce||❌|✅|
|Dance1||❌|✅|
|Dance2||❌|✅|