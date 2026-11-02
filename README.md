# unitree-go2-webapp

This app controls a Unitree Go2 robot dog from a web page. It was built to run a stage performance. An operator prepares a cue sheet: an ordered list of robot commands. During the show, the operator steps through the list with the arrow keys or a small game controller. Besides the cue sheet, the page shows the robot's camera feed, buttons for every action, gait, posture, light colour and speed, and a log of what the robot accepted or refused.

The app has two parts:

- a Python server (`backend/`) that talks to the robot over WebRTC and to the browser over a WebSocket;
- a Svelte web page (`unitree-go2-gui/`) that is the interface.

This tutorial takes you from starting the app to playing your own cue sheet.

## 1. Start the app

### Option A: the packaged macOS app

The packaged app contains the server, the web page and Python. You need a Mac with Apple Silicon (M1 or later); the app does not run on an Intel Mac.

1. Get `unitree-go2-vN.app`, where `vN` is the version, either from a release zip or by building it (see [section 9](#9-build-the-macos-app)).
2. Double-click it. On the first launch, macOS refuses to open it because Apple did not sign it. Open **System Settings → Privacy & Security**, scroll to **Security**, click **Open Anyway** next to the line about the app, and confirm.
3. The app has no window of its own. It starts a server on your Mac and, after about two seconds, opens your browser at <http://localhost:8000>. If the browser does not open, go to that address yourself.

Closing the browser tab does not stop the server. To stop it, quit `unitree-go2-vN` in Activity Monitor. The server writes its log to `~/Library/Logs/unitree-go2/relay.log`.

### Option B: from source, for development

You need Node 22 with npm, and Python 3.12. Use npm, not pnpm.

The server depends on a patched copy of the [go2_webrtc_connect](https://github.com/legion1581/go2_webrtc_connect) driver, which must sit in `backend/go2_webrtc_connect`. That folder is excluded from this repository. The patches (branch `local-fixes`) are currently not published, so you must obtain that folder from a maintainer.

Set up the Python environment once:

```sh
cd backend
python3.12 -m venv venv
venv/bin/pip install -e go2_webrtc_connect fastapi uvicorn
venv/bin/pip install -r requirements-dev.txt   # only to run the tests
```

The driver needs PortAudio for audio (`brew install portaudio`). Homebrew can interfere with virtual environments, so always call the programs inside `venv/bin/` by their path rather than activating the environment.

Then start the two parts in two terminals:

```sh
# Terminal 1: the server, on port 8000
cd backend
venv/bin/uvicorn main:app --reload

# Terminal 2: the web page, on port 5173
cd unitree-go2-gui
npm install
npm run dev
```

Open <http://localhost:5173>. The page always connects to the server at `ws://localhost:8000/ws`.

## 2. Connect to the robot

1. Turn the robot on and wait until it stands up.
2. Join the robot's own Wi-Fi network from your Mac. The server currently connects only in access-point mode, where the robot's address is `192.168.12.1`.
3. In the bottom strip of the page, check that **Websocket** shows ✅. This means the page reaches the server.
4. Click **Connect**. When **Robot** shows ✅, the robot is connected and the camera feed appears.

Most buttons stay greyed until the robot has reported its current gait, posture and speed. This takes a few seconds after connecting.

## 3. Read the screen

The page has four areas:

| Area | Position | Content |
|---|---|---|
| Video | background | The robot's camera feed, with optional face detection drawn over it. |
| Pane | over the video | Switches, then buttons grouped as Actions, Gaits, Posture changes, Light and Speed. |
| Cue sheet | right side | The list of cues you step through during the show, with a toolbar in edit mode. |
| Status strip | bottom | Connection state, controller and edit buttons, the last command's result and the log. |

**Show controller** in the status strip opens a drawing of the game controller on the left. Each of its buttons does what the matching keyboard key does, so you can use it to test without the physical controller.

## 4. Control the robot from the pane

Click a button in the pane to send its command right away.

- **Actions** run once: for example Hello, Stretch, FrontJump.
- **Gaits** set how the robot walks. The ticked gait is the robot's current one.
- **Posture changes** come in pairs. The left button enters a posture (for example sit down), the right button leaves it. Only the button that makes sense for the robot's current posture is usable.
- **Light** sets the headlight colour.
- **Speed** sets slow, normal or fast.

The switches at the top turn the lidar and obstacle avoidance on and off. **Face Detection** and **Face Landmarks** only change what is drawn over the video; they send nothing to the robot.

After you click, a spinner shows until the robot confirms the change. If the robot refuses, the button returns to its previous state and the log records why.

## 5. Play the cue sheet

The cue sheet is the list on the right. The cell sent last glows green. The cell the next → or Enter sends has bold text. A cell is either a single command, a wait, or a group of commands that run one after another; a group shows its number of commands in brackets.

Use these keys while the page has focus:

| Key | Effect |
|---|---|
| → | Sends the current cue, then moves to the next one. |
| ← | Sends the current cue, then moves to the previous one. |
| ↓ | Moves to the next cue without sending anything. |
| ↑ | Moves to the previous cue without sending anything. |
| Enter | Sends the current cue and stays on it. |
| A, B, X, Y | Sends the cell linked to that key (see [section 7](#7-link-controller-keys)). |

You can also click a cell to send it. It then glows, and the bold cell stays where it was.

A key linked to a gait or a light works as a toggle: the first press switches to that gait or colour, the next press switches back. A key linked to a posture pair enters the posture, and the next press leaves it.

A small Bluetooth controller such as an 8BitDo Micro, set to keyboard mode, sends these same keys.

## 6. Edit the cue sheet

Click **Edit** in the status strip. A toolbar of six tools appears above the cue sheet, and the status strip shows **Save**, **Reset**, **Cancel**, **Import** and **Export**. The pane buttons still send commands in edit mode, so you can try a command before you add it.

To add a command, choose **Move**, press a pane button, and drag it onto the cue sheet. A copy lands where you release it.

Each tool acts on the cells you click or drag across:

| Tool | How to use it | Result |
|---|---|---|
| Move | Drag a cell up or down. | The cell moves to the new position. |
| Rename | Click a cell, type, press Enter. | The cell gets the new label. Escape keeps the old one. Waits cannot be renamed; their label states their length. |
| Group | Drag from one cell to another. | The cells become one group that runs them in order. |
| Ungroup | Click a group, or drag across several. | Each group is replaced by the cells it contained. |
| Pause | Press on a cell and drag to the right. | A wait is added before the cell, or after it if you pressed its lower half. The further right you drag, the longer the wait, from 0.1 s to 5 s. Dragging on an existing wait changes its length. |
| Delete | Click a cell, or drag across several, then click **Confirm**. | The cells are removed. The sheet must keep at least one cell. |

Waits matter inside groups: the robot often ignores a command that arrives while it is still executing the previous one. A wait of 0.1 s between two commands is usually enough.

## 7. Link controller keys

The keys A, B, X and Y each send one cell, whatever the position in the cue sheet. By default, A sends Pose, B sends Bound, X sends Sitting and Y sends Dance.

To change a link:

1. Click **Edit**.
2. Press the key (A, B, X or Y) on the keyboard, or click it on the controller drawing. The cell it is currently linked to is highlighted.
3. Click a cell in the cue sheet or a button in the pane. The key is now linked to it.

Hovering over a face button on the controller drawing shows the label of its linked cell.

## 8. Save, share and restore a cue sheet

The edit buttons in the status strip do the following:

| Button | Effect |
|---|---|
| Save | Keeps your changes and returns to play mode. |
| Reset | Undoes every change since the last save, and stays in edit mode. |
| Cancel | Undoes every change since the last save, and returns to play mode. |
| Export | Downloads the shown sheet, the pane and the key links as `cue-sheet.json`. |
| Import | Loads a `cue-sheet.json` file. Click Save afterwards to keep it. If the file is invalid, a red message names the first problem. |

Save stores the sheet in the browser, for this address only. The packaged app (`localhost:8000`) and the development page (`localhost:5173`) therefore keep separate sheets. Use Export and Import to move a sheet between them, between computers, or to keep a backup before a show.

## 9. Build the macOS app

The build needs the Python environment from [section 1](#option-b-from-source-for-development), plus PyInstaller in it:

```sh
backend/venv/bin/pip install pyinstaller
./build.sh v4                    # builds the web page, then the app
./build.sh v4 --release          # also makes the zip to send to users
./build.sh v4 --skip-frontend    # reuses unitree-go2-gui/dist
```

The version (`v4` here) is required. It becomes part of the app's name, so that several versions can sit side by side in Applications. Each version gets its own folder, and building a version again replaces its folder's content:

```
dist-app/
  v4/
    unitree-go2-v4.app        the app
    unitree-go2-v4-mac.zip    with --release: the app and READ-ME-FIRST.txt
```

`READ-ME-FIRST.txt` at the root of the repository is the guide for users who receive the zip; the build replaces `{{VERSION}}` in it with the version. PyInstaller prints `Hidden import 'pycryptodome' not found` and `Hidden import 'uvicorn.loops.none' not found`; both are harmless. The packaging rules are in `unitree-go2.spec`.

To run the tests before building:

```sh
cd unitree-go2-gui && npx vitest --run && npm run check
cd backend && venv/bin/pytest
```

## 10. Troubleshooting

**The app does nothing when double-clicked.** Start it from a terminal to see its output:

```sh
dist-app/v4/unitree-go2-v4.app/Contents/MacOS/unitree-go2-v4
```

The most common cause is `address already in use`: another program uses port 8000. Quit it and try again.

**Websocket shows ❌.** The server is not running, or it runs on a port other than 8000.

**Robot stays ❌ after Connect.** Check that the Mac is on the robot's Wi-Fi. These commands help diagnose the network:

| Command | Purpose |
|---|---|
| `ping -c 4 192.168.12.1` | Checks that the robot answers at all. |
| `nc -vz 192.168.12.1 8081` | Checks that the robot's port 8081 is reachable. |
| `nc -vz 192.168.12.1 9991` | Checks that the robot's port 9991 is reachable. |
| `arp -a` | Lists the devices the Mac has seen on the network, with their addresses. |

**A button does nothing.** Open the **Log** button at the bottom right. Its counters show confirmed (✅), unconfirmed (❓) and failed (❌) commands, and the robot's active faults (⚠️). Each entry states what was sent and why it failed or was blocked.

## Repository layout

```
backend/
  main.py               server: WebSocket API, robot connection, command queue
  launcher.py           entry point of the packaged app
  tests/                pytest tests of the server
unitree-go2-gui/src/
  App.svelte            page layout and the pane
  components/           video, cue sheet, status strip, controller drawing
  lib/data/cues.ts      the default cue sheet, pane and key links
  lib/stores/           robot state and cue sheet state
build.sh                builds the packaged app and the release zip
READ-ME-FIRST.txt       guide included in the release zip
unitree-go2.spec        PyInstaller rules for the packaged app
```

## Resources

- List of actions available on the Go2: <https://mmwaves.de/blogs/go2-actions/>
- WebRTC driver for the Go2: <https://github.com/legion1581/go2_webrtc_connect>
