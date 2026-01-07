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

### Notes

Since the latest firmware update (august 2025) the driver is outdated: there are no more AI mode and Sports mode, so don't upgrade above 1.1.8 for now

Only one WebRTC connection can be open at a time, so if the mobile app is connected then any third party app will not be able to connect

After calling "Damp", the robot will not move until BalanceStand has been called
FreeWalk in AI mode is the most nervous mode and natural (no parasite steps)

To request obstacle avoidance from the client
first you need to take control of the dog (remote will not work):
 ```   
    msg.api_id = 1004
    msg.topic = 'rt/api/obstacles_avoid/request'
    msg.parameter = '{"is_remote_commands_from_api": true}'
```
then use the Move command but this has different parameters than the sport mode's move:
```
    msg.api_id = 1003
    msg.topic = 'rt/api/obstacles_avoid/request'
    msg.parameter = '{"x":0.23,"y":0.0,"yaw":0.0,"mode":0}'
```

### External documentation and resources

https://mmwaves.de/blogs/go2-actions/
https://github.com/Corey-Harding/Go2-WebRTC-Joystick-Control/blob/WIP/wireless_remote.py

<!-- 

Scratches the AI suggested solution to subscribe to the video stream.
The MediaRelay from aiortc seems to be the way to go, but the proposed implementation seem overengineered and poorly refactored, judging by the sheer number of ad-hoc control structures.
Maybe I have a functional programming bias, but this seems like a nightmare to maintain.
Subscribing to the videostream is not a priority feature anyways. -->

<!-- 
## Notes on using Cursor:

Scope pollution inside App.svelte. 
Svelte instantiates global variable in the component scope that should actually be module-scoped singletons. -->
