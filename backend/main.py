
version = 117

if version==117:
    from go2_webrtc_driver.webrtc_driver import Go2WebRTCConnection as WebRTCConnection, WebRTCConnectionMethod
    from go2_webrtc_driver.constants import RTC_TOPIC
    from go2_webrtc_driver.util import get_nested_field
elif version==118:
    from unitree_webrtc_connect.webrtc_driver import UnitreeWebRTCConnection as WebRTCConnection, WebRTCConnectionMethod
    from unitree_webrtc_connect.constants import RTC_TOPIC
    from unitree_webrtc_connect.util import get_nested_field

from pythonosc import udp_client
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from video_broadcaster import FrameBroadcaster
from collections import deque
from contextlib import asynccontextmanager, suppress
from pathlib import Path
import asyncio, logging, json, cv2
from aiortc import MediaStreamTrack
import av
av.logging.set_level(av.logging.ERROR)

osc_client = udp_client.SimpleUDPClient("192.168.1.130", 6000)
broadcaster = FrameBroadcaster()

COMMANDS_PATH = Path(__file__).resolve().parent.parent / "commands_1.1.7.json"
ACK_TIMEOUT_FLOOR = 5.0
ACK_TIMEOUT_MARGIN = 3.0

CONFIRMED, FAILED, REJECTED, UNKNOWN = "confirmed", "failed", "rejected", "unknown"
# A cue's verdict is its worst step. A refusal outranks silence because it is something the
# robot said, and every step must confirm for the cue to confirm.
OUTCOME_PRECEDENCE = (FAILED, REJECTED, UNKNOWN, CONFIRMED)


def read_exec_times(path=COMMANDS_PATH):
    """Map (topic, api_id) to the command's execution time in seconds. The key must carry the
    topic: api_ids repeat across topics, and 1005 is StandDown under SPORT_MOD and Brightness
    under VUI."""
    try:
        entries = json.loads(path.read_text())
    except Exception:
        logging.exception("No command table at %s, so every command gets the timeout floor", path)
        return {}
    return {
        (entry.get("topic"), entry.get("api_id")): entry.get("exec_time")
        for entry in entries
        if entry.get("api_id") is not None
    }


EXEC_TIMES = read_exec_times()


def ack_timeout(topic, api_id, exec_times=EXEC_TIMES):
    """How long one command may wait for its reply. Sized to the motion where exec_time is
    known, because the robot may answer only once the motion completes; a flat bound would
    manufacture a failure for every command whose motion outlasts it."""
    exec_time = exec_times.get((topic, api_id))
    if exec_time is None:
        return ACK_TIMEOUT_FLOOR
    return max(ACK_TIMEOUT_FLOOR, exec_time + ACK_TIMEOUT_MARGIN)


def outcome_of(reply):
    """Read one reply as (outcome, code, detail). An absent status.code is None and never -1,
    which is a code the sport service genuinely sends."""
    if reply is None:
        return (UNKNOWN, None, "no usable reply")
    code = get_nested_field(reply, "data", "header", "status", "code")
    if code is None:
        return (UNKNOWN, None, "reply carried no status.code")
    if code == 0:
        return (CONFIRMED, 0, None)
    return (FAILED, code, f"status.code={code}")


def cue_outcome(step_outcomes):
    """Reduce a sequence's per-step outcomes to the one verdict its request id gets."""
    if not step_outcomes:
        return (UNKNOWN, None, "cue contained no dispatchable command")
    outcome, code, detail = min(step_outcomes, key=lambda step: OUTCOME_PRECEDENCE.index(step[0]))
    if outcome == CONFIRMED:
        return (CONFIRMED, 0, f"{len(step_outcomes)} steps confirmed")
    return (outcome, code, detail)


async def recv_camera_stream(track: MediaStreamTrack):
        while True:
            frame = await track.recv()  # wait for next frame
            img = frame.to_ndarray(format="bgr24")
            _, jpeg = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if current_webSocket:
                try:
                    await current_webSocket.send_bytes(jpeg.tobytes())
                except Exception:
                    break  # client disconnected
        
class RobotSession:
    def __init__(self):
        self.conn: WebRTCConnection | None = None
        # The receive loop only enqueues; a single worker drains this, so no command can wedge
        # the control channel and cues still reach the robot in the order they were sent.
        self.commands: asyncio.Queue = asyncio.Queue()
        self.worker: asyncio.Task | None = None
        # Checkpoint 4 sends these to the browser; for now they are recorded and logged.
        self.results = deque(maxlen=200)
        self.rejection: asyncio.Future | None = None

    ## Connect to the robot with a timeout, and notify the frontend of the connection status
    async def connect(self, ip: str, timeout: int = 5):
        # Avoid reconnecting if already connected
        if self.conn and self.conn.isConnected:
            return
        # Initialize the connection object with the defined connection method and IP
        # self.conn = WebRTCConnection(WebRTCConnectionMethod.LocalSTA,ip=ip )
        self.conn = WebRTCConnection(WebRTCConnectionMethod.LocalAP)
        
        try:
            await asyncio.wait_for(self.conn.connect(), timeout)  # Add timeout to connect
            # The driver starts the heartbeat in on_validate; starting it here too leaves
            # a timer chain stop_heartbeat cannot cancel.
            self.conn.datachannel.pub_sub.set_on_err_callback(self.note_rejection)
            # notify the frontend about connection status
            if current_webSocket:
                try:
                    await current_webSocket.send_json({
                "type": "robot_state",
                "connected": self.conn.datachannel.data_channel_opened
            })
                except Exception as e:
                    print(f"An error occurred during connection: {e}")  # Handle other exceptions
                
            self.conn.video.add_track_callback(recv_camera_stream)
            # switchVideoChannel is a plain def returning None, so it cannot be awaited.
            self.conn.video.switchVideoChannel(True)

        
        except asyncio.TimeoutError:
            print("Connection attempt timed out.")  # Handle timeout
            self.conn = None  # Reset connection on timeout
        except Exception as e:
            print(f"An error occurred during connection: {e}")  # Handle other exceptions
    
    async def toggleLidar(self, switch: bool):
        state = "on" if switch else "off"
        def lidar_callback(message):
            # Print the data received from the LIDAR sensor.
            print(message["data"])
            
        if self.conn:
            self.conn.datachannel.pub_sub.publish_without_callback("rt/utlidar/switch",state)
            if switch:
                # Subscribe to the LIDAR voxel map data and use the callback function to process incoming messages.
                self.conn.datachannel.pub_sub.subscribe("rt/utlidar/voxel_map_compressed", lidar_callback)
            else:
                self.conn.datachannel.pub_sub.publish_without_callback("rt/utlidar/switch",'off')
                self.conn.datachannel.pub_sub.unsubscribe("rt/utlidar/voxel_map_compressed")

    async def disconnect(self):
        if self.conn:
            await self.conn.disconnect()
            self.conn = None

    async def subscribe_to_robotstate(self, switch):
        def callback(message):
            print(message)
            osc_client.send_message("/go2/data", message.get('data'))
            try:
                asyncio.get_running_loop().create_task(
                    notify_frontend({
                        'type': 'state_stream',
                        'data': message.get('data')
                    })
                )
            except Exception as e:
                logging.exception("Failed to schedule state notification")
        if switch:
            self.conn.datachannel.pub_sub.subscribe(
                RTC_TOPIC['LF_SPORT_MOD_STATE'], callback )
            # the following topics have a subscribe method: MULTIPLE_STATE, SPORT_MOD_STATE, LOW_STATE
   
        else :
            self.conn.datachannel.pub_sub.unsubscribe(RTC_TOPIC['LF_SPORT_MOD_STATE'])
        
    def note_rejection(self, message):
        """Attribute a bridge `err` to the command in flight. An `err` carries no request id,
        so this is sound only because the single worker serializes dispatch and there is never
        more than one command outstanding."""
        info = message.get("info")
        if info == "Validation Needed.":
            return  # part of the validation handshake, not a refusal of a command
        logging.warning("The bridge refused a request: %r", info)
        if self.rejection is not None and not self.rejection.done():
            self.rejection.set_result(f"the bridge refused the request: {info}")

    async def dispatch(self, msg):
        """Send one command and wait, bounded, for the robot's answer.

        A timeout never retries. The reply reports acceptance rather than completion, so a
        command that timed out has most likely been queued already and a retry would execute
        the motion twice.
        """
        topic = msg.get("topic")
        api_id = msg.get("api_id")
        payload = {"api_id": api_id}
        if "parameter" in msg:
            payload["parameter"] = msg.get("parameter")

        timeout = ack_timeout(topic, api_id)
        rejection = asyncio.get_running_loop().create_future()
        self.rejection = rejection
        request = asyncio.ensure_future(
            self.conn.datachannel.pub_sub.publish_request_new(
                RTC_TOPIC[topic], payload, timeout=timeout
            )
        )
        try:
            done, _ = await asyncio.wait({request, rejection}, return_when=asyncio.FIRST_COMPLETED)
            if rejection in done:
                return (REJECTED, None, rejection.result())
            return outcome_of(request.result())
        except asyncio.TimeoutError:
            return (UNKNOWN, None, f"no reply within {timeout:g}s")
        finally:
            self.rejection = None
            request.cancel()
            rejection.cancel()

    async def send_joystick_command(self, lx: float, ly: float, rx: float, ry: float, keys: int = 0):
        """Send a single joystick command without blocking"""
        try:
            # rt/wirelesscontroller answers nothing, and publish keys its future on
            # "msg $ rt/wirelesscontroller", which no reply ever matches.
            self.conn.datachannel.pub_sub.publish_without_callback(
                RTC_TOPIC["WIRELESS_CONTROLLER"],
                {
                    "lx": lx,
                    "ly": ly,
                    "rx": rx,
                    "ry": ry,
                    "keys": keys
                }
            )
        except Exception:
            logging.exception("Error sending joystick command")

    async def test_joystick(self):
        """Test sending commands rapidly using create_task"""
        try:
            print("Starting rapid joystick test with create_task...")
            start = asyncio.get_event_loop().time()
            
            # Send 5 commands rapidly as tasks (non-blocking)
            tasks = []
            for i in range(5):
                print(f"[{i}] Scheduling command at T+{asyncio.get_event_loop().time() - start:.3f}s")
                task = asyncio.get_running_loop().create_task(
                    self.send_joystick_command(lx=float(i) * 0.2, ly=0,rx=0, ry=0,keys=0)
                )
                tasks.append(task)
            
            # Wait for all tasks to complete
            await asyncio.gather(*tasks)
            print(f"✓ All commands sent in {asyncio.get_event_loop().time() - start:.3f}s")
            
        except Exception as e:
            print(f"❌ Error: {e}")
    async def run_sequence(self, sequence):
        """Execute a cue's steps in order and reduce them to one verdict."""
        step_outcomes = []
        for msg in sequence:
            match msg:
                case {"command_name": _}:
                    # OPEN QUESTION, awaiting a decision: a step that raises aborts the steps
                    # behind it, which is today's behaviour and is kept deliberately. Running
                    # the remaining steps and reporting the aggregate is the alternative.
                    step_outcomes.append(await self.dispatch(msg))
                case {"wait":_}:
                    await asyncio.sleep(msg.get("wait"))
        return cue_outcome(step_outcomes)

    async def execute(self, msg):
        """Run one queued item and record its verdict."""
        try:
            match msg:
                case {"sequence": sequence}:
                    verdict = await self.run_sequence(sequence)
                case _:
                    verdict = await self.dispatch(msg)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logging.exception("A command raised before the robot answered")
            verdict = (FAILED, None, f"{type(exc).__name__}: {exc}")
        self.record(msg, verdict)

    def record(self, msg, verdict):
        outcome, code, detail = verdict
        result = {
            "command_name": msg.get("command_name"),
            "outcome": outcome,
            "code": code,
            "detail": detail,
        }
        self.results.append(result)
        logging.info("Command verdict: %r", result)

    async def run_worker(self):
        """Drain the command queue one item at a time until the shutdown sentinel arrives."""
        while True:
            msg = await self.commands.get()
            try:
                if msg is None:
                    return
                await self.execute(msg)
            finally:
                self.commands.task_done()

current_webSocket: WebSocket | None = None # Current connected WebSocket


@asynccontextmanager
async def lifespan(app: FastAPI):
    robot.worker = asyncio.create_task(robot.run_worker())
    try:
        yield
    finally:
        robot.commands.put_nowait(None)
        # A command in flight is bounded by its own ack timeout, so the worker settles quickly.
        finished, _ = await asyncio.wait({robot.worker}, timeout=15)
        if not finished:
            robot.worker.cancel()
            with suppress(asyncio.CancelledError):
                await robot.worker


app = FastAPI(lifespan=lifespan) # create FastAPI app instance

async def notify_frontend(payload):
    global current_webSocket # use the global variable
    if current_webSocket is None:
        return
    try:
        await current_webSocket.send_json(payload)
    except Exception as e:
        logging.exception("Failed to push message to GUI")
        current_webSocket = None

@app.websocket("/ws")
async def ws_api(ws: WebSocket):
    global current_webSocket
    
    await ws.accept()
    current_webSocket = ws
    try:
        while True:
            try:
                raw = await ws.receive_text()
            except WebSocketDisconnect:
                logging.info("Control channel closed by the client.")
                break
            except RuntimeError:
                logging.exception("Control channel is no longer readable.")
                break

            try:
                msg = json.loads(raw)
            except Exception:
                # One bad frame must not end the performance: log it and keep reading.
                logging.exception("Discarding an unparseable control frame: %r", raw)
                continue

            try:
                print("Received WS message:", msg)
                match msg:
                    case {"command_name": "lidar", "switch": switch}:
                        await robot.toggleLidar(msg["switch"])
                    case {"command_name": "connect", "ip": ip}:
                        await robot.connect(ip)
                    case {"command_name": "disconnect"}:
                        await robot.disconnect()
                    case {"command_name": "subscribe", "switch": _}:
                        await robot.subscribe_to_robotstate(msg["switch"])
                    case {"command_name": "joystick"}:
                        await robot.test_joystick()
                    case {"sequence": _} | {"api_id": _}:
                        # Robot commands are queued, never awaited here: waiting for the robot
                        # inside this loop is what stops the operator reaching the next cue.
                        robot.commands.put_nowait(msg)
                    case _:
                        logging.warning("Unknown message type received: %r", msg)
                await ws.send_json(msg)
            except SystemExit as exc:
                # Handle SystemExit to prevent the server from stopping
                logging.exception("SystemExit in command handler (treated as failure).")
                await ws.send_json({"ok": False, "error": "SystemExit occurred, command failed."})
            except Exception as exc:
                logging.exception("Error in command handler")
                await ws.send_json({"ok": False, "error": str(exc)})
    finally:
        try:
            await ws.close()
        except Exception:
            logging.exception("Error while closing websocket")

@app.websocket("/ws/video")
async def ws_video(ws: WebSocket):
    await ws.accept()
    print("Video client connected")
    try:
        while True:
            # wait for the next available frame
            frame = await broadcaster.get_frame(timeout=1.0)
            if frame:
                try:
                    await ws.send_bytes(frame)
                except Exception:
                    break  # client disconnected
            else:
                # no frame yet; avoid busy-looping
                await asyncio.sleep(0.01)
    except WebSocketDisconnect:
        print("Video client disconnected")
    except Exception as e:
        print(f"Error in video WS: {e}")
    finally:
        try:
            await ws.close()
        except:
            pass          
robot = RobotSession() # create a RobotSession instance


