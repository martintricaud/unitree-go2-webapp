"""
Video Relay Service
Relays video track from the robot WebRTC connection to browser clients.
Uses MediaRelay to forward the video track without re-encoding.
"""
import logging
from typing import Optional, Dict
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer
from aiortc.contrib.media import MediaRelay
from aiortc.rtcrtpsender import RTCRtpSender


class VideoRelay:
    """
    Manages video relay from robot to browser clients.
    Encapsulates all relay state and operations.
    """
    
    def __init__(self):
        """Initialize the video relay with a MediaRelay instance."""
        self._relay = MediaRelay()
        self._robot_video_track: Optional[object] = None
        self._browser_connections: Dict[str, RTCPeerConnection] = {}
    
    def set_robot_video_track(self, track):
        """Set the video track received from the robot and relay to existing connections."""
        self._robot_video_track = track
        logging.info("Robot video track set for relay")
        
        # For existing browser connections, add the relayed track
        for connection_id, pc in self._browser_connections.items():
            try:
                relayed_track = self._relay.subscribe(track, buffered=True)
                # Check if connection already has a video transceiver
                transceivers = pc.getTransceivers()
                video_transceiver = None
                for t in transceivers:
                    if t.kind == "video" and t.sender.track is None:
                        video_transceiver = t
                        break
                
                if video_transceiver:
                    video_transceiver.sender.replaceTrack(relayed_track)
                else:
                    pc.addTrack(relayed_track)
                logging.info(f"Added relayed track to existing browser connection {connection_id}")
            except Exception as e:
                logging.error(f"Error adding relayed track to connection {connection_id}: {e}")
    
    async def create_browser_peer_connection(self, connection_id: str) -> RTCPeerConnection:
        """
        Create a new peer connection for a browser client.
        The video track from the robot will be relayed to this connection.
        """
        # Create peer connection for browser
        pc = RTCPeerConnection(
            RTCConfiguration(
                iceServers=[RTCIceServer(urls=["stun:stun.l.google.com:19302"])]
            )
        )
        
        # If we have the robot's video track, relay it to this browser connection
        if self._robot_video_track:
            # Create a relayed track (proxy) from the robot's track
            relayed_track = self._relay.subscribe(self._robot_video_track, buffered=True)
            # Add the relayed track to the browser peer connection
            pc.addTrack(relayed_track)
            logging.info(f"Added relayed video track to browser connection {connection_id}")
        else:
            # Add transceiver for video (will be set up when track becomes available)
            pc.addTransceiver("video", direction="recvonly")
            logging.info(f"Created browser connection {connection_id}, waiting for robot video track")
        
        self._browser_connections[connection_id] = pc
        return pc
    
    async def handle_browser_offer(self, connection_id: str, offer_sdp: str) -> str:
        """
        Handle SDP offer from browser and return answer.
        """
        pc = self._browser_connections.get(connection_id)
        if not pc:
            pc = await self.create_browser_peer_connection(connection_id)
        
        # Set remote description (browser's offer)
        offer = RTCSessionDescription(sdp=offer_sdp, type="offer")
        await pc.setRemoteDescription(offer)
        
        # Create answer
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        return answer.sdp
    
    async def add_ice_candidate(self, connection_id: str, candidate_dict: dict):
        """Add ICE candidate from browser."""
        pc = self._browser_connections.get(connection_id)
        if pc:
            from aiortc import RTCIceCandidate
            candidate = RTCIceCandidate(
                candidate_dict.get("candidate", ""),
                candidate_dict.get("sdpMid"),
                candidate_dict.get("sdpMLineIndex")
            )
            await pc.addIceCandidate(candidate)
    
    async def close_browser_connection(self, connection_id: str):
        """Close a browser peer connection."""
        pc = self._browser_connections.pop(connection_id, None)
        if pc:
            await pc.close()
            logging.info(f"Closed browser connection {connection_id}")


# Global instance - in a production app, this could be managed by dependency injection
_video_relay_instance: Optional[VideoRelay] = None


def get_video_relay() -> VideoRelay:
    """Get or create the global video relay instance."""
    global _video_relay_instance
    if _video_relay_instance is None:
        _video_relay_instance = VideoRelay()
    return _video_relay_instance
