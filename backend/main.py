
version = 117

if version==117:
    from go2_webrtc_driver.webrtc_driver import Go2WebRTCConnection as WebRTCConnection, WebRTCConnectionMethod 
    from go2_webrtc_driver.constants import RTC_TOPIC
elif version==118:
    from unitree_webrtc_connect.webrtc_driver import UnitreeWebRTCConnection as WebRTCConnection, WebRTCConnectionMethod
    from unitree_webrtc_connect.constants import RTC_TOPIC

from pythonosc import udp_client
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from video_broadcaster import FrameBroadcaster
import asyncio, logging, json, cv2
from aiortc import MediaStreamTrack
import av
av.logging.set_level(av.logging.ERROR)

osc_client = udp_client.SimpleUDPClient("192.168.1.130", 6000)
broadcaster = FrameBroadcaster()
            
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
            self.conn.datachannel.heartbeat.start_heartbeat()
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
            await asyncio.wait_for(self.conn.video.switchVideoChannel(True), timeout)

        
        except asyncio.TimeoutError:
            print("Connection attempt timed out.")  # Handle timeout
            self.conn = None  # Reset connection on timeout
        except Exception as e:
            print(f"An error occurred during connection: {e}")  # Handle other exceptions
    
    async def toggleLidar(self, switch: bool):
        command = "on" if switch else "off"
        def lidar_callback(message):
            # Print the data received from the LIDAR sensor.
            print(message["data"])
            
        if self.conn:
            self.conn.datachannel.pub_sub.publish_without_callback("rt/utlidar/switch",command)
            if switch:
                # Subscribe to the LIDAR voxel map data and use the callback function to process incoming messages.
                self.conn.datachannel.pub_sub.subscribe("rt/utlidar/voxel_map_compressed", lidar_callback)

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
        
    async def handle_command(self, msg):
        payload = {"api_id": msg.get("api_id")}
        topic = msg.get("topic")
        if("parameter" in msg):
            payload = {**payload, **{"parameter":msg.get("parameter")}}
        print(payload)
        await self.conn.datachannel.pub_sub.publish_request_new(RTC_TOPIC[topic], payload)
    

    async def send_joystick_command(self, lx: float, ly: float, rx: float, ry: float, keys: int = 0):
        """Send a single joystick command without blocking"""
        try:
            await self.conn.datachannel.pub_sub.publish(
                RTC_TOPIC["WIRELESS_CONTROLLER"],
                {
                    "lx": lx,
                    "ly": ly,
                    "rx": rx,
                    "ry": ry,
                    "keys": keys
                }
            )
        except Exception as e:
            logging.exception(f"Error sending joystick command: {e}")

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
    async def execute_sequence(self, sequence):
        for msg in sequence:
            match msg:
                case {"command": _}:
                    await robot.handle_command(msg)
                case {"wait":_}:
                    await asyncio.sleep(msg.get("wait"))

current_webSocket: WebSocket | None = None # Current connected WebSocket
app = FastAPI() # create FastAPI app instance

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
                msg = await ws.receive_json()
            except Exception as e: # Could be a malformed JSON or a disconnect
                logging.exception("Failed to receive message:", e)
                break  # exit loop if WS is closed
            
            try:
                print("Received WS message:", msg)
                match msg:
                    case {"command": "lidar", "switch": switch}:
                        await robot.toggleLidar(msg["switch"])
                    case {"command": "connect", "ip": ip}:
                        await robot.connect(ip)
                    case {"command": "disconnect"}:
                        await robot.disconnect()
                    case {"sequence": sequence}:
                        await robot.execute_sequence(sequence)
                    case {"command": "subscribe", "switch": _}:
                        print(msg)
                        await robot.subscribe_to_robotstate(msg["switch"])
                    case {"command": "joystick"}:
                        await robot.test_joystick()
                    case {"api_id": _}:
                        await robot.handle_command(msg)
                    case _:
                        logging.warning("Unknown message type received:", msg)
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


