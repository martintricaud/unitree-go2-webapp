<script lang="ts">
    import {
        ThemeUtils,
        Separator,
        Checkbox,
        RadioGrid,
        Point,
        Button,
        Pane,
        RotationEuler,
        type RotationEulerValueObject,
        type PanePosition,
        type ButtonClickEvent,
        type CheckboxChangeEvent,
        type RadioGridChangeEvent,
        type PointValue2d,
        type PointChangeEvent,
        type RotationEulerChangeEvent,
    } from "svelte-tweakpane-ui";
    import { commands_switches, commands_oneshot } from "./lib/commands";
    ThemeUtils.setGlobalDefaultTheme(ThemeUtils.presets.retro);
    type Mode = "AI" | "SPORT";

    let eulerAngles: RotationEulerValueObject = {
        x: 0,
        y: 0,
        z: 0,
    };

    let ws: WebSocket | null = null;
    let connected = false;
    // UI state for the connect control; mirrors `connected` once commands succeed.
    let connectControlValue = connected;
    // Track the command we are waiting to hear back about from the backend.
    let pendingConnectCommand: "connect" | "disconnect" | null = null;
    let mode: Mode = "AI";

    const modeOptions: Mode[] = ["AI", "SPORT"];
    let xyValue: PointValue2d = { x: 0, y: 0 };
    
    // Video streaming state - using WebRTC relay through backend
    let videoStreaming = false;
    let videoStreamingControlValue = false;
    let videoElement: HTMLVideoElement | null = null;
    let peerConnection: RTCPeerConnection | null = null;
    let videoConnectionId: string | null = null;

    // initialize WebSocket connection
    // Establish (or re-establish) the WebSocket and restore any command that was queued.
    function init_websocket() {
        ws = new WebSocket("ws://localhost:8000/ws");
        ws.onopen = () => {
            console.log("WebSocket connected");
            connectControlValue = connected;
            if (pendingConnectCommand) {
                sendCommand({ command: pendingConnectCommand });
            }
        };
        ws.onclose = () => {
            console.log("WebSocket disconnected");
            ws = null;
            connected = false;
            connectControlValue = false;
            pendingConnectCommand = null;
            // Stop video streaming on disconnect
            stopVideoStream();
        };
        ws.onmessage = async (msg) => {
            console.log("WS message:", msg.data);
            try {
                const payload = JSON.parse(msg.data);
                const { status, command, message } = payload;

                // Handle WebRTC video relay signaling
                if (command === "webrtc_video_answer") {
                    await handleWebRTCAnswer(payload.sdp, payload.connection_id);
                    return;
                } else if (command === "start_video") {
                    // Video started on robot, now establish browser connection
                    if (videoStreamingControlValue && !peerConnection) {
                        await establishVideoConnection();
                    }
                }

                // Only update the checkbox if the command completed successfully.
                if (
                    status === "success" &&
                    (command === "connect" || command === "disconnect")
                ) {
                    connected = command === "connect";
                    connectControlValue = connected;
                    pendingConnectCommand = null;
                    // For errors, log the issue and allow the user to retry.
                } else if (
                    status === "error" &&
                    command === pendingConnectCommand
                ) {
                    console.error("Command failed:", message ?? payload);
                    connectControlValue = connected;
                    pendingConnectCommand = null;
                }
            } catch (error) {
                console.warn("Unable to parse WS message", error);
            }
        };
    }

    // Helper that sends a command to the backend and returns whether it was sent immediately.
    function sendCommand(msg: object) {
        console.log(JSON.stringify(msg));
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
            return true;
        }
        console.warn("WebSocket not ready to send command", ws?.readyState);
        return false;
    }

    // Toggle the connection checkbox; only update the UI when the backend confirms.
    function toggleConnect(event: CheckboxChangeEvent) {
        // Prevent multiple pending connect/disconnect commands.
        if (pendingConnectCommand) {
            connectControlValue = connected;
            console.warn("Connect/disconnect already pending");
            return;
        }

        if (!ws) init_websocket();

        const desiredState = event.detail.value;
        const command: "connect" | "disconnect" = desiredState
            ? "connect"
            : "disconnect";
        pendingConnectCommand = command;

        // Try to send immediately; if the socket is still opening, we keep the command queued.
        const sent = sendCommand({ command });
        if (!sent) {
            console.info("Command queued until WebSocket is open");
        }

        // Revert the checkbox for now; the backend response will flip it when confirmed.
        connectControlValue = connected;
    }

    function handleModeChange(event: RadioGridChangeEvent) {
        mode = event.detail.value as Mode;
        sendCommand({ command: "set_mode", mode });
    }

    function sendEuler(event: RotationEulerChangeEvent) {
        let _x: number = event.detail.value.x
        let _y: number = event.detail.value.y
        let _z: number = event.detail.value.z

        sendCommand({ command: "set_orientation", _x, _y, _z });
    }

    // Convert XY pad updates into move commands.
    function handleXYChange(event: PointChangeEvent) {
        const value = event.detail.value as PointValue2d;
        let x: number;
        let y: number;

        if (Array.isArray(value)) {
            [x, y] = value;
        } else {
            ({ x, y } = value);
        }

        sendCommand({ command: "move", x, y });
    }
    
    // WebRTC video streaming functions - connecting to backend relay
    async function startVideoStream() {
        if (!connected || !ws || !videoElement) {
            console.warn("Cannot start video: not connected or video element missing");
            return;
        }

        // First, start video on the robot
        sendCommand({ command: "start_video" });
        videoStreamingControlValue = true;
    }

    async function establishVideoConnection() {
        if (!ws || !videoElement) {
            console.warn("Cannot establish video connection: missing WebSocket or video element");
            return;
        }

        try {
            // Generate connection ID
            videoConnectionId = crypto.randomUUID();

            // Create RTCPeerConnection to backend relay
            peerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });

            // Handle incoming video tracks from relay
            peerConnection.ontrack = (event) => {
                console.log("Received video track from relay");
                if (videoElement && event.track) {
                    videoElement.srcObject = event.streams[0];
                    videoStreaming = true;
                }
            };

            // Handle ICE candidates - send to backend
            peerConnection.onicecandidate = (event) => {
                if (event.candidate && videoConnectionId) {
                    sendCommand({
                        command: "webrtc_ice_candidate",
                        connection_id: videoConnectionId,
                        candidate: {
                            candidate: event.candidate.candidate,
                            sdpMid: event.candidate.sdpMid,
                            sdpMLineIndex: event.candidate.sdpMLineIndex
                        }
                    });
                }
            };

            // Handle connection state changes
            peerConnection.onconnectionstatechange = () => {
                console.log("WebRTC connection state:", peerConnection?.connectionState);
                if (peerConnection?.connectionState === "failed" || 
                    peerConnection?.connectionState === "closed") {
                    stopVideoStream();
                }
            };

            // Create offer to receive video from backend relay
            const offer = await peerConnection.createOffer({
                offerToReceiveVideo: true,
                offerToReceiveAudio: false
            });
            await peerConnection.setLocalDescription(offer);

            // Send offer to backend relay
            sendCommand({
                command: "webrtc_video_offer",
                connection_id: videoConnectionId,
                sdp: {
                    sdp: offer.sdp,
                    type: offer.type
                }
            });

        } catch (error) {
            console.error("Error establishing video connection:", error);
            stopVideoStream();
        }
    }

    async function handleWebRTCAnswer(answerSdp: { sdp: string; type: string }, connectionId?: string) {
        if (!peerConnection) {
            console.error("No peer connection when receiving answer");
            return;
        }

        // Verify connection ID matches
        if (connectionId && connectionId !== videoConnectionId) {
            console.warn("Connection ID mismatch");
            return;
        }

        try {
            const answer = new RTCSessionDescription({
                sdp: answerSdp.sdp,
                type: answerSdp.type as RTCSdpType
            });
            await peerConnection.setRemoteDescription(answer);
            console.log("Set remote description successfully");
        } catch (error) {
            console.error("Error setting remote description:", error);
            stopVideoStream();
        }
    }

    function stopVideoStream() {
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
        }
        videoConnectionId = null;
        videoStreaming = false;
        videoStreamingControlValue = false;
    }

    // Toggle video streaming
    function toggleVideo(event: CheckboxChangeEvent) {
        if (!ws) init_websocket();
        
        const desiredState = event.detail.value;
        videoStreamingControlValue = desiredState;
        
        if (desiredState) {
            startVideoStream();
        } else {
            stopVideoStream();
        }
    }
</script>

<div>
    <Checkbox
        value={connectControlValue}
        on:change={toggleConnect}
        label="Connect to Robot"
    />

    <RadioGrid
        values={modeOptions}
        value={mode}
        on:change={handleModeChange}
        label="Mode"
        columns={2}
    />

    <Pane position="draggable" title="Control buttons">
        {#each commands_oneshot as { api_method, description, modeCompatibility }}
                <Button
                    on:click={() => sendCommand({ command: api_method })}
                    disabled={modeCompatibility
                        ? !modeCompatibility[mode]
                        : false}
                    title={description}
                    label={description}
                />
            {/each}
        <Separator/>
        {#each commands_switches as { api_method, description, modeCompatibility }}
        <Button
            on:click={() => sendCommand({ command: api_method })}
            disabled={modeCompatibility
                ? !modeCompatibility[mode]
                : false}
            title={description}
            label={description}
        />
    {/each}
    </Pane>
    <Pane position="draggable" title="Movement">
        <RotationEuler
            bind:value={eulerAngles}
            expanded={true}
            label="CSS Rotation"
            picker="inline"
            on:change={sendEuler}
        />
        <Button
        on:click={() =>
            (eulerAngles = {
                x: 0,
                y: 0,
                z: 0,
            })}
        title="Reset"
    />
        <Separator/>
        <Point
            expanded={true}
            label="XY Pad"
            picker="inline"
            bind:value={xyValue}
            on:change={handleXYChange}
        />
       
    </Pane>
    
    <Pane position="draggable" title="Video Stream">
        <Checkbox
            value={videoStreamingControlValue}
            on:change={toggleVideo}
            label="Enable Video Stream"
            disabled={!connected}
        />
        <video
            bind:this={videoElement}
            autoplay
            playsinline
            style="max-width: 100%; height: auto; border: 1px solid #ccc; background: #000;"
        >
            Your browser does not support video playback.
        </video>
        {#if videoStreaming && !videoElement?.srcObject}
            <p>Connecting to video stream...</p>
        {:else if !videoStreaming}
            <p>Video stream disabled. Enable it above to see the robot's camera feed.</p>
        {/if}
    </Pane>
</div>
