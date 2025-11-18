# backend/robot_client.py
"""
Robot client module - encapsulates robot connection and command execution.
"""
import asyncio
from typing import Optional
from go2_webrtc_driver.webrtc_driver import Go2WebRTCConnection, WebRTCConnectionMethod
from go2_webrtc_driver.constants import RTC_TOPIC, SPORT_CMD
from video_relay import get_video_relay


class RobotClient:
    """
    Encapsulates the robot WebRTC connection and provides command methods.
    Makes dependencies explicit and state manageable.
    """
    
    def __init__(
        self,
        connection_method: WebRTCConnectionMethod,
        ip: Optional[str] = None,
        serial_number: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None
    ):
        """
        Initialize robot client with connection parameters.
        
        Args:
            connection_method: How to connect (LocalAP, LocalSTA, Remote)
            ip: Robot IP address (for LocalSTA/LocalAP)
            serial_number: Robot serial number (for LocalSTA/Remote)
            username: Unitree account username (for Remote)
            password: Unitree account password (for Remote)
        """
        self.connection_method = connection_method
        self.robot_ip = ip
        self.robot_sn = serial_number
        self.robot_token = None  # Would be set for remote connections
        
        # Create connection instance
        if connection_method == WebRTCConnectionMethod.LocalAP:
            self.conn = Go2WebRTCConnection(connection_method)
        elif connection_method == WebRTCConnectionMethod.LocalSTA:
            if ip:
                self.conn = Go2WebRTCConnection(connection_method, ip=ip)
            elif serial_number:
                self.conn = Go2WebRTCConnection(connection_method, serialNumber=serial_number)
            else:
                raise ValueError("LocalSTA requires either ip or serial_number")
        elif connection_method == WebRTCConnectionMethod.Remote:
            if not (serial_number and username and password):
                raise ValueError("Remote connection requires serial_number, username, and password")
            self.conn = Go2WebRTCConnection(connection_method, serialNumber=serial_number, 
                                          username=username, password=password)
        else:
            raise ValueError(f"Unknown connection method: {connection_method}")
    
    async def connect(self):
        """Connect to the robot and return a status string for the frontend."""
        try:
            await self.conn.connect()
        except SystemExit as exc:
            raise RuntimeError(
                "Failed to establish WebRTC connection to the robot. "
                "Verify that the Go2 is powered on and reachable over the network."
            ) from exc
        except Exception as exc:
            raise RuntimeError(f"Robot connection failed: {exc}") from exc

        return "robot connected"
    
    async def disconnect(self):
        """Disconnect from the robot and return a status string for the frontend."""
        await self.conn.disconnect()
        return "robot disconnected"
    
    @property
    def is_connected(self) -> bool:
        """Check if robot is connected."""
        return self.conn.isConnected
    
    async def set_mode(self, mode: str):
        """Set robot mode. 'normal', 'ai', etc."""
        mode_name = mode.lower()
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["MOTION_SWITCHER"],
            {"api_id": 1002, "parameter": {"name": mode_name}}
        )
        return f"mode change requested: {mode_name}"

    # Move robot in SPORT mode
    # vx: Range [-2.5~3.8] (m/s); vy: Range [-1.0~1.0] (m/s); vyaw: Range [-4~4] (rad/s).
    # returns 0 on successful call
    # The latest Move command will be maintained for 1 second.
    async def move(self, vx: float, vy: float, vyaw: float = 0):
        """Send a movement command and confirm the parameters that were dispatched."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["Move"], "parameter": {"vx": vx, "vy": vy, "vyaw": vyaw}}
        )
        return f"move command dispatched: vx={vx}, vy={vy}, vyaw={vyaw}"

    async def euler(self, roll: float, pitch: float, yaw: float):
        """Set robot orientation using Euler angles."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {
                "api_id": SPORT_CMD["Euler"],
                "parameter": {"roll": roll, "pitch": pitch, "yaw": yaw}
            }
        )

    async def handstand(self):
        """Enter handstand mode."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"], 
            {
                "api_id": SPORT_CMD["StandOut"],
                "parameter": {"data": True}
            }
        )

    ##################################################
    ### STATE CHANGING COMMANDS WITH NO PARAMETERS ###
    ##################################################

    async def damp(self):
        """Enter damping state."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["Damp"]}
        )

    async def balance_stand(self):
        """Enter balance stand mode."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["BalanceStand"]}
        )

    async def stop_move(self):
        """Stop movement."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["StopMove"]}
        )

    async def stand_down(self):
        """Stand down."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["StandDown"]}
        )

    async def stand_up(self):
        """Stand up."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["StandUp"]}
        )

    async def recovery_stand(self):
        """Enter recovery stand mode."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["RecoveryStand"]}
        )

    async def rise_sit(self):
        """Stand up relative to sitting, reaching a balanced standing position."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["RiseSit"]}
        )

    ###########################################################################
    ### METHODS WITH NO PARAMETERS WHICH DO NOT MODIFY STATE, I.E. ONESHOTS ###
    ###########################################################################

    async def hello(self):
        """Perform a HELLO movement."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["Hello"]}
        )

    async def sit(self):
        """Sit down."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["Sit"]}
        )

    async def front_jump(self):
        """Perform a front jump."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["FrontJump"]}
        )

    async def front_flip(self):
        """Perform a front flip."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["FrontFlip"]}
        )

    async def scrape(self):
        """Perform scrape movement."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["Scrape"]}
        )

    async def heart(self):
        """Make a heart shape with paws."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["Heart"]}
        )

    async def content(self):
        """Express happiness."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["Content"]}
        )

    async def stretch(self):
        """Stretch movement."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {"api_id": SPORT_CMD["Stretch"]}
        )

    ############################################################################
    ### METHODS WITH 1 BOOLEAN PARAMETER (WHICH MODIFY STATE), I.E. SWITCHES ###
    ############################################################################

    async def pose(self, state: bool):
        """Set to true to strike a pose, false to return to normal stance."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {
                "api_id": SPORT_CMD["Pose"],
                "parameter": {"flag": state}
            }
        )

    async def free_jump(self, state: bool):
        """Set to true to enter jump mode; set to false to exit jump mode and enter agile mode."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {
                "api_id": SPORT_CMD["FreeJump"],
                "parameter": {"data": state}
            }
        )

    async def free_avoid(self, state: bool):
        """Set to true to enter avoidance mode, false to exit and enter agile mode."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {
                "api_id": SPORT_CMD["FreeAvoid"],
                "parameter": {"data": state}
            }
        )

    async def walk_upright(self, state: bool):
        """Set to true to walk upright, false to return to normal."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {
                "api_id": SPORT_CMD["WalkUpright"],
                "parameter": {"data": state}
            }
        )

    async def cross_step(self, state: bool):
        """Set to true to enter cross-step mode, false to exit and enter agile mode."""
        await self.conn.datachannel.pub_sub.publish_request_new(
            RTC_TOPIC["SPORT_MOD"],
            {
                "api_id": SPORT_CMD["CrossStep"],
                "parameter": {"data": state}
            }
        )

    ##################################################
    ### VIDEO STREAMING WITH RELAY ###
    ##################################################

    async def start_video(self, video_relay):
        """
        Start video streaming from the robot and set up relay for browser clients.
        
        Args:
            video_relay: VideoRelay instance to use for forwarding video
        """
        if not self.is_connected:
            raise RuntimeError("Robot not connected. Connect first before starting video.")
        
        # Switch video channel on
        self.conn.video.switchVideoChannel(True)
        
        # Add callback to capture video track for relay
        async def capture_track_for_relay(track):
            """Capture the video track and set up relay to browser clients."""
            video_relay.set_robot_video_track(track)
        
        self.conn.video.add_track_callback(capture_track_for_relay)
        
        return "video streaming started"


# Global instance - in production, this could be managed by dependency injection
# or created per-request/connection
_robot_client_instance: Optional[RobotClient] = None


def get_robot_client() -> RobotClient:
    """Get or create the global robot client instance."""
    global _robot_client_instance
    if _robot_client_instance is None:
        # Default configuration - in production, this could come from config/env
        _robot_client_instance = RobotClient(
            connection_method=WebRTCConnectionMethod.LocalSTA,
            ip="192.168.123.161"
        )
    return _robot_client_instance


# Legacy function exports for backward compatibility with main.py
# These delegate to the global instance
async def connect():
    return await get_robot_client().connect()

async def disconnect():
    return await get_robot_client().disconnect()

async def set_mode(mode: str):
    return await get_robot_client().set_mode(mode)

async def move(vx: float, vy: float, vyaw: float = 0):
    return await get_robot_client().move(vx, vy, vyaw)

async def start_video():
    return await get_robot_client().start_video(get_video_relay())
