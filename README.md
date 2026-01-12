# unitree-go2-webapp

## Folder structure

```
unitree_webapp/
├─ backend/
│  └─ main.py          # FastAPI backend
└─ unitree-go2-gui/
   ├─ public/
   ├─ src
   |  ├─ lib/ # Contains the webSocket client implementation
   │  ├─ components/ # GUI components including video display
   │  ├─ App.svelte   # main Svelte component
   │  └─ ...
   └─ commands_1.1.7.json list of commands together with various relevant metatada 
```

## Dependencies 
The project relies on the following dependencies

|Dependency|Role|
|---|---|
|Mediapipe|Computer Vision / Video processing of the Go2's camera|
|Ramda|Functional abstractions|
|Svelte|UI and state management|
|unitree_webrtc_connect|Connexion between the server and the Go2|

## Troubleshooting

If you have trouble connecting to the Go2, the following commands are useful to know

```nc -vz 192.168.3.164 8081```: Checks if port 8081 is open and reachable on the host 192.168.3.164 using netcat.

```nc -vz 192.168.3.164 9991```: Checks if port 9991 is open and reachable on the host 192.168.3.164 using netcat.

```arp -a```: Displays the ARP (Address Resolution Protocol) cache, listing IP-to-MAC address mappings on the local network.

```ping -c 4 -S 192.168.3.164``` Sends 4 ICMP echo requests (pings) to a target, using 192.168.3.164 as the source IP address.

## Startup instructions

Warning: Homebrew tends to mess with python virtual environments, so install and launch python packages using the explicit executable's path within the venv
launch the server with ```venv/bin/uvicorn main:app --reload```

If connecting in AP (access point mode) the IP of the Go2 is 192.168.12.1
If connecting in STA-L (i.e. connected over a shared router), the IP of the Go2 is 192.168.123.161

## Features
### Video Processing
Face detection and face landmarking are implemented on the videostream using MediaPipe.
Further video processing capabilities - namely age and gender classification - are on the roadmap, using `tflite` models from this [GitHub Repo](https://github.com/shubham0204/Age-Gender_Estimation_TF-Android/tree/master/app/src/main/assets)

### Control with a 3rd party Gamepad
I am currently looking into adding support for a 3rd party remote controller (e.g. bluetooth gamepads) is under development.
It seems there is an API topic which makes it possible, but I haven't figured out how to continuously get the Go2 to move while the gamepad is being polled.
The solution used in other repos, e.g. [this one](https://github.com/Corey-Harding/Go2-WebRTC-Joystick-Control/blob/WIP) doesn't seem to work

## Links, resources and other documentation
Description of actions available on the Go2 (September 2015) : https://mmwaves.de/blogs/go2-actions/




