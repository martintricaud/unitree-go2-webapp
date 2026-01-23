
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

broadcaster = FrameBroadcaster()

async def broadcast_state(state):
        if current_webSocket:
            asyncio.get_running_loop().create_task(
            current_webSocket.send_json(json.loads(state))
        )
            # try:
            #     await current_webSocket.send_json(json.loads(state))
            # except Exception as e:
            #     print(f"An error occurred while broadcasting state: {e}")  # Handle other exceptions 
                
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
                    
            # await notify_frontend()
            print(self.conn.video)      
            self.conn.video.add_track_callback(recv_camera_stream)
            await asyncio.wait_for(self.conn.video.switchVideoChannel(True), timeout)

        
        except asyncio.TimeoutError:
            print("Connection attempt timed out.")  # Handle timeout
            self.conn = None  # Reset connection on timeout
        except Exception as e:
            print(f"An error occurred during connection: {e}")  # Handle other exceptions
    
    async def disconnect(self):
        if self.conn:
            await self.conn.disconnect()
            self.conn = None

    async def subscribe_to_robotstate(self, switch):
        # callback = lambda message: asyncio.create_task(notify_frontend(json.loads(message['data'])))
        def callback(message):
            
            lambda message: asyncio.create_task(notify_frontend(json.loads(message['data'])))
            print(message)
        if switch:
            self.conn.datachannel.pub_sub.subscribe(
                RTC_TOPIC['LF_SPORT_MOD_STATE'], 
                # callback ## notify frontend asynchronous
                osc_callback
            )
            self.conn.datachannel.pub_sub.subscribe(
                RTC_TOPIC['MULTIPLE_STATE'], 
                callback ## notify frontend asynchronously
            )
        else :
            self.conn.datachannel.pub_sub.unsubscribe(RTC_TOPIC['LF_SPORT_MOD_STATE'])
            self.conn.datachannel.pub_sub.unsubscribe(RTC_TOPIC['MULTIPLE_STATE'])
        

    async def handle_command(self, msg):
        payload = {"api_id": msg.get("api_id")}
        topic = msg.get("topic")
        if("parameter" in msg):
            payload = {**payload, **{"parameter":msg.get("parameter")}}
        print(payload)
        await self.conn.datachannel.pub_sub.publish_request_new(RTC_TOPIC[topic], payload)
    

    async def test_joystick(self):
        try:
            await asyncio.wait_for(
                await self.conn.datachannel.pub_sub.publish(
                    RTC_TOPIC["WIRELESS_CONTROLLER"],
                    {
                            "lx": 0.5,
                            "ly": 0,
                            "rx": 0,
                            "ry": 0,
                            "keys": 0
                    }
                ),
                timeout=0.5  # seconds
            )
            await asyncio.wait_for(
                await self.conn.datachannel.pub_sub.publish(
                    RTC_TOPIC["WIRELESS_CONTROLLER"],
                    {
                            "lx": 0,
                            "ly": 1,
                            "rx": 0,
                            "ry": 0,
                            "keys": 0
                    }
                ),
                timeout=0.5  # seconds
            )
        except asyncio.TimeoutError:
            print("Publish timed out!")
        except Exception as e:
            print(f"Error during publish: {e}")
    async def execute_sequence(self, sequence):
        for msg in sequence:
            match msg:
                case {"command": _}:
                    await robot.handle_command(msg)
                case {"wait":_}:
                    await asyncio.sleep(msg.get("wait"))


    async def oz_overture(self):
        await self.handle_command({"topic":'SPORT_MOD',"api_id":1020 })
        await self.handle_command({"topic":'SPORT_MOD',"api_id":2049, "parameter":{"data":True}})
        await asyncio.sleep(3.1)
        await self.handle_command({"topic":'SPORT_MOD',"api_id":1015,"parameter":{"data":-1}})
        await self.handle_command({"topic":'SPORT_MOD',"api_id": 1008,"parameter":{"x":0,"y":0.0,"z":2}})
        await asyncio.sleep(3)
        await self.handle_command({"topic":'SPORT_MOD',"api_id": 1008, "parameter":{"x":0,"y":0.0,"z":-2}
        })
        
    # async def stretch_hello_jump(self):
    #     await self.handle_command({"topic":'SPORT_MOD',"api_id": 1003})  # Stop Move
    #     await self.handle_command({"topic":'SPORT_MOD',"api_id":1017})  # Stretch 
    #     await self.handle_command({"topic":'SPORT_MOD',"api_id":1016}) # Hello
    #     await asyncio.sleep(0.3)
    #     await self.handle_command({"topic":'SPORT_MOD',"api_id":1031})  # First jump
    #     await asyncio.sleep(0.1)
    #     await self.handle_command({"topic":'SPORT_MOD',"api_id":1031})  # Second jump
    #     await asyncio.sleep(0.1)
    #     await self.handle_command({"topic":'SPORT_MOD',"api_id":2049, "parameter":{"data":True}})  # Back to classic mode

current_webSocket: WebSocket | None = None # Current connected WebSocket
app = FastAPI() # create FastAPI app instance

async def notify_frontend(payload):
    # if current_webSocket:
    #     try:
    #         await current_webSocket.send_json(payload)
    #     except Exception:
    #         break  # client disconnected
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
                    case {"command": "stretch_hello"}:
                        await robot.stretch_hello_jump()
                    case {"command": "oz_overture"}:
                        await robot.oz_overture()
                    case {"api_id": _}:
                        await robot.handle_command(msg)
                    case _:
                        logging.warning("Unknown message type received:", msg)
                await ws.send_json({"ok": True})
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

#TODO: Replace with the target IP and port of your OSC receiver
osc_client = udp_client.SimpleUDPClient("192.168.1.100", 9000)

# @app.post("/data")
# async def receive_data(data: dict):
#     # Extract numerical values from the WebRTC stream
#     value = data["value"]
#     # Send as OSC message (e.g., address "/robot/data", value)
#     osc_client.send_message("/robot/data", value)
#     return {"status": "sent"}

def osc_callback(data):
    # Extract the numerical value(s) from the data
    value = data["value"]  # Adjust based on the actual data structure
    # Send as OSC message (e.g., address "/go2/data", value)
    osc_client.send_message("/go2/data", value)
    # Optional: Print for debugging
    print(f"Sent OSC: {value}")