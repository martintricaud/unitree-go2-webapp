# backend/main.py
from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from robot_client import get_robot_client
from video_relay import get_video_relay
import asyncio
import json
import uuid
import logging

app = FastAPI(title="Unitree Go2 WebSocket API")

# Allow your frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change to frontend origin for production
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket endpoint for robot control
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            command = data.get("command")

            try:
                # Each branch executes a robot command and responds with a structured payload so the
                # frontend can distinguish success from failure and update its UI accordingly.
                # Get instances (explicit dependency injection)
                robot_client = get_robot_client()
                video_relay = get_video_relay()
                
                if command == "connect":
                    status = await robot_client.connect()
                    await ws.send_json({"command": command, "status": "success", "message": status})
                elif command == "disconnect":
                    status = await robot_client.disconnect()
                    await ws.send_json({"command": command, "status": "success", "message": status})
                elif command == "start_video":
                    # Start video on robot and set up relay
                    status = await robot_client.start_video(video_relay)
                    await ws.send_json({
                        "command": command,
                        "status": "success",
                        "message": status,
                    })
                elif command == "webrtc_video_offer":
                    # Handle WebRTC SDP offer from browser for video relay
                    try:
                        connection_id = data.get("connection_id") or str(uuid.uuid4())
                        offer_sdp = data.get("sdp", {}).get("sdp", "")
                        if not offer_sdp:
                            raise ValueError("Missing SDP offer")
                        
                        answer_sdp = await video_relay.handle_browser_offer(connection_id, offer_sdp)
                        await ws.send_json({
                            "command": "webrtc_video_answer",
                            "status": "success",
                            "connection_id": connection_id,
                            "sdp": {
                                "sdp": answer_sdp,
                                "type": "answer"
                            }
                        })
                    except Exception as exc:
                        await ws.send_json({
                            "command": "webrtc_video_answer",
                            "status": "error",
                            "message": str(exc)
                        })
                elif command == "webrtc_ice_candidate":
                    # Handle ICE candidate from browser
                    try:
                        connection_id = data.get("connection_id")
                        candidate = data.get("candidate")
                        if connection_id and candidate:
                            await video_relay.add_ice_candidate(connection_id, candidate)
                    except Exception as exc:
                        logging.error(f"Error adding ICE candidate: {exc}")
                elif command == "set_mode":
                    mode = data.get("mode")
                    if mode:
                        status = await robot_client.set_mode(mode)
                        await ws.send_json({
                            "command": command,
                            "status": "success",
                            "message": status,
                            "mode": mode,
                        })
                    else:
                        await ws.send_json({
                            "command": command,
                            "status": "error",
                            "message": "missing mode",
                        })
                elif command == "move":
                    x = data.get("x", 0)
                    y = data.get("y", 0)
                    z = data.get("z", 0)
                    status = await robot_client.move(x, y, z)
                    await ws.send_json({
                        "command": command,
                        "status": "success",
                        "message": status,
                        "parameters": {"x": x, "y": y, "z": z},
                    })
                else:
                    await ws.send_json({
                        "command": command,
                        "status": "error",
                        "message": f"unknown command: {command}",
                    })
            except Exception as exc:
                # Surface exceptions to the client without closing the socket; this allows the UI to
                # react appropriately and retry if needed.
                await ws.send_json({
                    "command": command,
                    "status": "error",
                    "message": str(exc),
                })

    except Exception as e:
        await ws.close()
        print(f"WebSocket closed due to exception: {e}")
