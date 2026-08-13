"""Fixtures for the relay tests. No robot and no network: the robot's replies are scripted,
and where the behaviour under test lives in the driver, the driver's own pub_sub runs against
a fake data channel."""

import asyncio
import json

import pytest

import main
from go2_webrtc_driver.msgs.pub_sub import WebRTCDataChannelPubSub


def reply_for(api_id, code, request_id=1):
    """The reply envelope the Go2 sends for every rt/api/* service. `code=None` omits the
    status block, which is the shape a reply carrying no status.code has."""
    header = {"identity": {"id": request_id, "api_id": api_id}}
    if code is not None:
        header["status"] = {"code": code}
    return {"type": "res", "topic": "rt/api/sport/request", "data": {"header": header}}


class FakeChannel:
    """The aiortc data channel as pub_sub uses it: a ready state and a send()."""

    def __init__(self, ready_state="open"):
        self.readyState = ready_state
        self.sent = []

    def send(self, message):
        self.sent.append(json.loads(message))


class ScriptedPubSub:
    """Stands in for the driver's pub_sub. `behaviour` maps an api_id to how the robot answers:

    ("code", n)  reply with status.code n
    ("code", None) reply carrying no status.code at all
    "silent"     never reply, so the caller's own bound is what ends the wait
    ("late", n)  reply only after the caller has already timed out
    "reject"     the bridge refuses the request, in a message carrying no request id
    ("raise", e) fail to send at all
    """

    def __init__(self, behaviour=None, reply_delay=0.001, late_delay=0.10):
        self.behaviour = behaviour or {}
        self.reply_delay = reply_delay
        self.late_delay = late_delay
        self.sent = []
        self.on_err_callback = None

    def set_on_err_callback(self, callback):
        self.on_err_callback = callback

    def publish_without_callback(self, topic, data=None, msg_type=None):
        self.sent.append({"topic": topic, "data": data, "awaited": False})

    async def publish_request_new(self, topic, options=None, timeout=None):
        api_id = (options or {}).get("api_id")
        self.sent.append({"topic": topic, "options": options, "timeout": timeout, "awaited": True})
        script = self.behaviour.get(api_id, ("code", 0))

        if script == "reject":
            asyncio.get_running_loop().call_soon(
                self.on_err_callback, {"type": "err", "info": "Invalid Topic.xx"}
            )
            script = "silent"

        if script == "silent":
            # The real publish_request_new bounds its own wait, so expiry surfaces here.
            await asyncio.sleep(timeout if timeout is not None else 3600)
            raise asyncio.TimeoutError

        if script[0] == "raise":
            raise script[1]

        if script[0] == "late":
            await asyncio.sleep(self.late_delay)
            return reply_for(api_id, script[1])

        await asyncio.sleep(self.reply_delay)
        return reply_for(api_id, script[1])


class FakeHeartbeat:
    """The driver's heartbeat as the relay reads it: the time of the last reply, None until
    the robot answers one."""

    def __init__(self):
        self.heartbeat_response = None


class FakeDataChannel:
    """The driver's data channel as the relay reads it: the pub_sub it publishes through, the
    flag the validation callback sets, and the heartbeat."""

    def __init__(self, pub_sub, opened=True):
        self.pub_sub = pub_sub
        self.data_channel_opened = opened
        self.heartbeat = FakeHeartbeat()


class FakeConnection:
    """Exposes the paths the relay uses: conn.datachannel and conn.disconnect()."""

    def __init__(self, pub_sub, opened=True):
        self.datachannel = FakeDataChannel(pub_sub, opened)
        self.isConnected = True
        self.disconnected = False

    async def disconnect(self):
        self.disconnected = True


class FakeWebSocket:
    """Feeds ws_api a scripted list of raw frames, then reports a client disconnect."""

    def __init__(self, frames):
        self.frames = list(frames)
        self.sent = []
        self.accepted = False
        self.closed = False

    async def accept(self):
        self.accepted = True

    async def receive_text(self):
        if not self.frames:
            raise main.WebSocketDisconnect(code=1000)
        return self.frames.pop(0)

    async def send_json(self, payload):
        self.sent.append(payload)

    async def close(self):
        self.closed = True


@pytest.fixture
def fast_timeouts(monkeypatch):
    """Shrink the ack bound so a silent command resolves in a fraction of a second. Tests using
    this send api_ids absent from the command table, so the floor is what applies."""
    monkeypatch.setattr(main, "ACK_TIMEOUT_FLOOR", 0.15)
    monkeypatch.setattr(main, "ACK_TIMEOUT_MARGIN", 0.0)


@pytest.fixture
def pub_sub():
    return ScriptedPubSub()


@pytest.fixture
def session(pub_sub):
    """A RobotSession wired to the scripted pub_sub, with no worker running yet."""
    robot = main.RobotSession()
    robot.conn = FakeConnection(pub_sub)
    pub_sub.set_on_err_callback(robot.note_rejection)
    return robot


@pytest.fixture
async def worker(session):
    """The session's single worker, running for the duration of one test."""
    task = asyncio.get_running_loop().create_task(session.run_worker())
    session.worker = task
    yield task
    session.commands.put_nowait(None)
    finished, _ = await asyncio.wait({task}, timeout=2)
    if not finished:
        task.cancel()


@pytest.fixture
def relay(monkeypatch, session):
    """Install the test's session as the module-level robot that ws_api talks to."""
    monkeypatch.setattr(main, "robot", session)
    monkeypatch.setattr(main, "current_webSocket", None)
    return session


@pytest.fixture
def gui(monkeypatch):
    """The browser's control socket, as notify_frontend writes to it."""
    ws = FakeWebSocket([])
    monkeypatch.setattr(main, "current_webSocket", ws)
    return ws


@pytest.fixture
def driver_pub_sub():
    """The driver's real pub_sub over a fake channel, for its pending-future bookkeeping."""
    return WebRTCDataChannelPubSub(FakeChannel())
