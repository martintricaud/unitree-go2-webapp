# main.py
import asyncio, logging, json
from fastapi import FastAPI, WebSocket
from unitree_webrtc_connect.webrtc_driver import UnitreeWebRTCConnection, WebRTCConnectionMethod
from unitree_webrtc_connect.constants import RTC_TOPIC, SPORT_CMD


# ------------------------------------------------------------
# Only one GUI client → just store its WebSocket
# ------------------------------------------------------------
# Current connected WebSocket
current_ws: WebSocket | None = None

async def notify_frontend(payload):
    global current_ws # use the global variable
    if current_ws is None:
        return
    try:
        await current_ws.send_json(payload)
    except Exception as e:
        logging.exception("Failed to push message to GUI")
        current_ws = None
        
class RobotSession:
    def __init__(self):
        self.conn: UnitreeWebRTCConnection | None = None

    ## Connect to the robot with a timeout, and notify the frontend of the connection status
    async def connect(self, ip: str, timeout: int = 5):
        # Avoid reconnecting if already connected
        if self.conn and self.conn.isConnected:
            return
        # Initialize the connection object with the defined connection method and IP
        # self.conn = UnitreeWebRTCConnection(WebRTCConnectionMethod.LocalSTA,ip=ip )
        self.conn = UnitreeWebRTCConnection(WebRTCConnectionMethod.LocalAP)
        
        try:
            await asyncio.wait_for(self.conn.connect(), timeout)  # Add timeout to connect
            ## notify the frontend about connection status
            await notify_frontend({
                "type": "robot_state",
                "connected": self.conn.datachannel.data_channel_opened
            })
        
        except asyncio.TimeoutError:
            print("Connection attempt timed out.")  # Handle timeout
            self.conn = None  # Reset connection on timeout
        except Exception as e:
            print(f"An error occurred during connection: {e}")  # Handle other exceptions
    
    ## Subscribe to multiplestate data
    async def subscribe_to_robotstate(self):
        self.conn.datachannel.pub_sub.subscribe(
            RTC_TOPIC['MULTIPLE_STATE'], 
            lambda message: asyncio.create_task(notify_frontend(json.loads(message['data']))) ## notify frontend asynchronously
        )
    async def disconnect(self):
        if self.conn:
            await self.conn.disconnect()
            self.conn = None
            
    async def move(self, vx, vy, vyaw):
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {
                "api_id": SPORT_CMD["Move"],
                "parameter": {"vx": vx, "vy": vy, "vyaw": vyaw}
            }
        )

    async def stop(self):
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["StopMove"]}
        )
        
    async def hello(self):
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"], 
            {"api_id": SPORT_CMD["Hello"]}
        )
    
    async def stretch(self):
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["Stretch"]}
        )
    async def content(self):
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["Content"]}
        )
    async def heart(self):
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["Heart"]}
        )
    async def scrape(self):
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["Scrape"]}
        )
    async def wallow(self):
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["Wallow"]}
    )
    
    async def standup(self):
        await self.connect.data_channel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["StandUp"]}
    )
        
    async def standown(self):
        await self.connect.data_channel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["StandDown"]}
    )
        
    async def recovery_stand(self):
        await self.connect.data_channel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["RecoveryStand"]}
    )
        
    async def sit(self):
        await self.connect.data_channel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["Sit"]}
    )
        
    async def rise_sit(self):
        await self.connect.data_channel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["RiseSit"]}
    )
        
    async def front_flip(self):
        await self.connect.data_channel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["FrontFlip"]}
    )
        
    async def front_jump(self):
        await self.connect.data_channel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["FrontJump"]}
    )
        
    async def front_pounce(self):
        await self.connect.data_channel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_COMMAND["FrontPounce"]}
    )   

app = FastAPI() # create FastAPI app instance
robot = RobotSession() # create a RobotSession instance

# Dispatch table: map command names to async functions
COMMAND_HANDLERS = {
    "connect": lambda msg: robot.connect(msg["ip"]),
    "disconnect": lambda msg: robot.disconnect(),
    "move": lambda msg: robot.move(msg["vx"], msg["vy"], msg["vyaw"]),
    "stop": lambda msg: robot.stop(),
    "hello": lambda msg: robot.hello()
    # add remaining commands here...
}

@app.websocket("/ws")
async def ws_api(ws: WebSocket):
    global current_ws
    await ws.accept()

    # ------------------------------------------------------------
    # Track the GUI connection (only one exists)
    # ------------------------------------------------------------
    current_ws = ws
    try:
        while True:
            try:
                msg = await ws.receive_json()
            except Exception as e:
                # Could be a malformed JSON or a disconnect
                logging.exception("Failed to receive message:", e)
                break  # exit loop if WS is closed

            command = msg.get("command")
            handler = COMMAND_HANDLERS.get(command)
            
            if not handler:
                await ws.send_json({"ok": False, "error": "unknown command"})
                continue
            
            try:
                await handler(msg)
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