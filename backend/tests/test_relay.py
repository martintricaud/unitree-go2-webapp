"""Every wait the relay makes must be bounded, and every answer the robot gives must land in
exactly one of four outcomes. No robot and no network: see conftest for the stubs."""

import asyncio
import json
import logging
import time

import pytest

import main
from go2_webrtc_driver.msgs.error_handler import handle_error

from .conftest import FakeConnection, FakeWebSocket, reply_for

TOPIC = "rt/api/sport/request"

# api_ids absent from commands_1.1.7.json, so the timeout floor is what applies to them.
OK, FAILS, MUTE, SILENT, REFUSED = 9001, 9002, 9003, 9004, 9005


def command(api_id, name="Test", topic="SPORT_MOD"):
    """One robot command in the shape the browser sends it."""
    return {"kind": "command", "api_id": api_id, "topic": topic, "command_name": name}


def wait(seconds=0.0):
    return {"kind": "wait", "wait": seconds}


def nested(*items, name="Nested"):
    """A sequence item, as the browser sends one inside a cue."""
    return {"kind": "sequence", "displayName": name, "sequence": list(items)}


# ── Reading one reply ────────────────────────────────────────────────────────────────────


def test_a_zero_status_code_confirms():
    assert main.outcome_of(reply_for(OK, 0)) == (main.CONFIRMED, 0, None)


def test_a_non_zero_status_code_fails():
    outcome, code, detail = main.outcome_of(reply_for(FAILS, 3203))
    assert (outcome, code) == (main.FAILED, 3203)
    assert "3203" in detail


def test_a_reply_without_a_status_code_is_unknown():
    outcome, code, _ = main.outcome_of(reply_for(MUTE, None))
    assert (outcome, code) == (main.UNKNOWN, None)


def test_minus_one_is_a_code_the_robot_sends_and_not_an_absent_field():
    """The sport service has been captured replying code -1, so -1 must never mark absence."""
    assert main.outcome_of(reply_for(FAILS, -1)) == (main.FAILED, -1, "status.code=-1")


def test_no_usable_reply_is_unknown():
    assert main.outcome_of(None)[0] == main.UNKNOWN


# ── Sizing the wait ──────────────────────────────────────────────────────────────────────


def test_the_command_table_is_keyed_by_topic_and_api_id(tmp_path):
    """api_id 1005 is StandDown under SPORT_MOD and Brightness under VUI, so the api_id alone
    cannot identify a command."""
    table = tmp_path / "commands.json"
    table.write_text(
        json.dumps(
            [
                {"command_name": "StandDown", "api_id": 1005, "topic": "SPORT_MOD", "exec_time": 2.26},
                {"command_name": "Brightness", "api_id": 1005, "topic": "VUI", "exec_time": None},
            ]
        )
    )
    assert main.read_exec_times(table) == {("SPORT_MOD", 1005): 2.26, ("VUI", 1005): None}


def test_an_unreadable_command_table_leaves_every_command_on_the_floor(tmp_path):
    assert main.read_exec_times(tmp_path / "absent.json") == {}


def test_the_relay_loads_the_shipped_command_table():
    assert main.EXEC_TIMES, "the relay must read commands_1.1.7.json itself"
    assert all(len(key) == 2 for key in main.EXEC_TIMES)


def test_the_ack_bound_is_sized_to_the_motion_and_floored():
    exec_times = {("SPORT_MOD", 1): 10, ("SPORT_MOD", 2): 1, ("VUI", 3): None}
    assert main.ack_timeout("SPORT_MOD", 1, exec_times) == 13.0
    assert main.ack_timeout("SPORT_MOD", 2, exec_times) == main.ACK_TIMEOUT_FLOOR
    assert main.ack_timeout("VUI", 3, exec_times) == main.ACK_TIMEOUT_FLOOR
    assert main.ack_timeout("SPORT_MOD", 4242, exec_times) == main.ACK_TIMEOUT_FLOOR


# ── Dispatching one command ──────────────────────────────────────────────────────────────


async def test_dispatch_classifies_what_the_robot_answers(session, pub_sub, fast_timeouts):
    pub_sub.behaviour = {OK: ("code", 0), FAILS: ("code", 3203), MUTE: ("code", None), SILENT: "silent"}
    outcomes = [(await session.dispatch(command(api_id)))[0] for api_id in (OK, FAILS, MUTE, SILENT)]
    assert outcomes == [main.CONFIRMED, main.FAILED, main.UNKNOWN, main.UNKNOWN]


async def test_a_silent_command_resolves_unknown_within_its_bound(session, pub_sub, fast_timeouts):
    pub_sub.behaviour = {SILENT: "silent"}
    started = time.perf_counter()
    outcome, code, detail = await session.dispatch(command(SILENT))
    assert (outcome, code) == (main.UNKNOWN, None)
    assert "no reply within" in detail
    assert time.perf_counter() - started < main.ACK_TIMEOUT_FLOOR * 4


async def test_a_timed_out_command_is_never_retried(session, pub_sub, fast_timeouts):
    """The reply is an acceptance, so a retry would execute the motion a second time."""
    pub_sub.behaviour = {SILENT: "silent"}
    await session.dispatch(command(SILENT))
    assert len(pub_sub.sent) == 1


async def test_a_bridge_refusal_classifies_as_rejected(session, pub_sub, fast_timeouts):
    pub_sub.behaviour = {REFUSED: "reject"}
    outcome, _, detail = await session.dispatch(command(REFUSED))
    assert outcome == main.REJECTED
    assert "Invalid Topic.xx" in detail


async def test_a_validation_err_is_not_read_as_a_refusal(session, pub_sub, fast_timeouts):
    """`Validation Needed.` belongs to the handshake the driver answers, not to a command."""
    pub_sub.behaviour = {OK: ("code", 0)}
    session.rejection = asyncio.get_running_loop().create_future()
    session.note_rejection({"type": "err", "info": "Validation Needed."})
    assert not session.rejection.done()


async def test_dispatch_passes_the_parameter_through(session, pub_sub, fast_timeouts):
    await session.dispatch({**command(OK), "parameter": {"x": 0, "y": -1}})
    assert pub_sub.sent[0]["options"]["parameter"] == {"x": 0, "y": -1}


async def test_dispatch_bounds_the_wait_it_hands_the_driver(session, pub_sub):
    await session.dispatch(command(OK))
    assert pub_sub.sent[0]["timeout"] == main.ACK_TIMEOUT_FLOOR


# ── One verdict per cue ──────────────────────────────────────────────────────────────────


def cue(*api_ids):
    steps = [command(api_id, name=f"step{api_id}") for api_id in api_ids]
    return [steps[0], wait(), *steps[1:]]


async def test_a_cue_confirms_only_when_every_step_confirms(session, fast_timeouts):
    outcome, code, detail = await session.run_sequence(cue(OK, OK))
    assert (outcome, code) == (main.CONFIRMED, 0)
    assert detail == "2 steps confirmed"


async def test_a_failed_step_fails_the_whole_cue(session, pub_sub, fast_timeouts):
    pub_sub.behaviour = {FAILS: ("code", 3203)}
    outcome, code, _ = await session.run_sequence(cue(OK, FAILS))
    assert (outcome, code) == (main.FAILED, 3203)


async def test_a_silent_step_leaves_the_cue_unknown(session, pub_sub, fast_timeouts):
    pub_sub.behaviour = {SILENT: "silent"}
    assert (await session.run_sequence(cue(OK, SILENT)))[0] == main.UNKNOWN


async def test_a_failure_outranks_silence_in_a_cue(session, pub_sub, fast_timeouts):
    pub_sub.behaviour = {SILENT: "silent", FAILS: ("code", 3203)}
    outcome, code, _ = await session.run_sequence(cue(SILENT, FAILS))
    assert (outcome, code) == (main.FAILED, 3203)


async def test_a_cue_with_nothing_dispatchable_is_unknown(session, fast_timeouts):
    outcome, _, detail = await session.run_sequence([wait()])
    assert outcome == main.UNKNOWN
    assert "no dispatchable command" in detail


async def test_a_step_that_raises_aborts_the_steps_behind_it(session, pub_sub, fast_timeouts):
    """Today's behaviour, kept deliberately. Whether it should continue instead is an open
    question the plan records as undecided."""
    pub_sub.behaviour = {FAILS: ("raise", RuntimeError("Data channel is not open"))}
    await session.execute(nested(*cue(FAILS, OK)))
    assert [entry["options"]["api_id"] for entry in pub_sub.sent] == [FAILS]
    assert session.results[-1]["outcome"] == main.FAILED


async def test_a_cue_step_waits_the_time_it_asks_for(session, pub_sub, fast_timeouts):
    started = time.perf_counter()
    await session.run_sequence([command(OK), wait(0.05)])
    assert time.perf_counter() - started >= 0.05


# ── Nested sequences, and items the relay cannot read ────────────────────────────────────


async def test_a_nested_sequence_dispatches_every_leaf(session, pub_sub, fast_timeouts):
    """Two levels of nesting. Matching on command_name alone dropped the nested item silently."""
    leaves = [9201, 9202, 9203, 9204]
    outcome, code, detail = await session.run_sequence(
        [
            command(leaves[0], name="first"),
            nested(
                command(leaves[1], name="second"),
                wait(),
                nested(command(leaves[2], name="third"), name="inner"),
                name="middle",
            ),
            command(leaves[3], name="fourth"),
        ]
    )
    assert [entry["options"]["api_id"] for entry in pub_sub.sent] == leaves
    assert (outcome, code) == (main.CONFIRMED, 0)
    assert detail == "4 steps confirmed", "a leaf's outcome must count towards the enclosing cue"


async def test_a_failed_leaf_fails_the_enclosing_cue(session, pub_sub, fast_timeouts):
    pub_sub.behaviour = {FAILS: ("code", 3203)}
    outcome, code, _ = await session.run_sequence([command(OK), nested(command(FAILS))])
    assert (outcome, code) == (main.FAILED, 3203)


async def test_a_silent_leaf_leaves_the_enclosing_cue_unknown(session, pub_sub, fast_timeouts):
    pub_sub.behaviour = {SILENT: "silent"}
    assert (await session.run_sequence([nested(command(SILENT)), command(OK)]))[0] == main.UNKNOWN


async def test_a_failed_leaf_outranks_a_silent_leaf_in_another_branch(session, pub_sub, fast_timeouts):
    """Precedence holds across nesting levels because every leaf feeds the one reduction."""
    pub_sub.behaviour = {SILENT: "silent", FAILS: ("code", 3203)}
    outcome, code, _ = await session.run_sequence(
        [nested(command(SILENT), name="left"), nested(command(FAILS), name="right")]
    )
    assert (outcome, code) == (main.FAILED, 3203)


async def test_an_item_of_an_unrecognised_kind_is_logged_and_not_sent(session, pub_sub, fast_timeouts, caplog):
    with caplog.at_level(logging.WARNING):
        outcome, _, _ = await session.run_sequence([{"kind": "pirouette", "api_id": OK, "topic": "SPORT_MOD"}])
    assert pub_sub.sent == [], "an item the relay cannot read must not reach the robot"
    assert "pirouette" in caplog.text
    assert outcome == main.UNKNOWN


async def test_an_item_with_no_kind_is_logged_rather_than_dropped(session, pub_sub, fast_timeouts, caplog):
    with caplog.at_level(logging.WARNING):
        await session.run_sequence([{"api_id": OK, "topic": "SPORT_MOD", "command_name": "Hello"}])
    assert pub_sub.sent == []
    assert "no recognised kind" in caplog.text


# ── The queue and its single worker ──────────────────────────────────────────────────────


async def test_cue_order_survives_the_queue(relay, worker, pub_sub, fast_timeouts):
    names = ["StopMove", "Stretch", "Hello", "FrontJump", "Sit"]
    frames = [json.dumps(command(9100 + i, name=name)) for i, name in enumerate(names)]

    await main.ws_api(FakeWebSocket(frames))
    await asyncio.wait_for(relay.commands.join(), 3)

    assert [entry["options"]["api_id"] for entry in pub_sub.sent] == [9100 + i for i in range(5)]
    assert [result["command_name"] for result in relay.results] == names


async def test_a_silent_command_does_not_strand_the_cues_behind_it(relay, worker, pub_sub, fast_timeouts):
    pub_sub.behaviour = {9102: "silent"}
    frames = [json.dumps(command(9100 + i, name=f"cue{i}")) for i in range(5)]

    started = time.perf_counter()
    await main.ws_api(FakeWebSocket(frames))
    accepted = time.perf_counter() - started

    assert accepted < main.ACK_TIMEOUT_FLOOR, "the receive loop waited on the robot"
    assert len(relay.results) < 5, "the receive loop drained the queue instead of returning"

    await asyncio.wait_for(relay.commands.join(), 3)
    assert [result["outcome"] for result in relay.results] == [
        main.CONFIRMED, main.CONFIRMED, main.UNKNOWN, main.CONFIRMED, main.CONFIRMED
    ]


async def test_the_worker_records_a_verdict_per_command(relay, worker, pub_sub, fast_timeouts):
    pub_sub.behaviour = {FAILS: ("code", 3203)}
    await main.ws_api(FakeWebSocket([json.dumps(command(FAILS, name="BadCmd"))]))
    await asyncio.wait_for(relay.commands.join(), 3)
    assert relay.results[-1] == {
        "command_name": "BadCmd",
        "outcome": main.FAILED,
        "code": 3203,
        "detail": "status.code=3203",
    }


async def test_a_sequence_reaches_the_worker_as_one_item(relay, worker, pub_sub, fast_timeouts):
    await main.ws_api(FakeWebSocket([json.dumps(nested(*cue(OK, OK)))]))
    await asyncio.wait_for(relay.commands.join(), 3)
    assert len(relay.results) == 1
    assert relay.results[0]["outcome"] == main.CONFIRMED


async def test_a_nested_cue_still_answers_with_one_verdict(relay, worker, pub_sub, fast_timeouts):
    """One request id, one verdict, however deeply the cue nests."""
    pub_sub.behaviour = {FAILS: ("code", 3203)}
    frame = nested(command(OK), nested(command(FAILS), name="inner"))
    await main.ws_api(FakeWebSocket([json.dumps(frame)]))
    await asyncio.wait_for(relay.commands.join(), 3)
    assert len(relay.results) == 1
    assert (relay.results[0]["outcome"], relay.results[0]["code"]) == (main.FAILED, 3203)


async def test_a_message_carrying_no_kind_never_reaches_the_queue(relay, worker, pub_sub, fast_timeouts, caplog):
    """`kind` is what marks a cue item, so a frame without one is not something to send."""
    with caplog.at_level(logging.WARNING):
        await main.ws_api(FakeWebSocket([json.dumps({"api_id": OK, "topic": "SPORT_MOD"})]))
        await asyncio.wait_for(relay.commands.join(), 3)
    assert pub_sub.sent == []
    assert list(relay.results) == []
    assert "Unknown message type" in caplog.text


async def test_the_worker_survives_a_command_it_cannot_send(relay, worker, pub_sub, fast_timeouts):
    """An unknown topic raises out of dispatch; the worker must record it and keep draining."""
    await main.ws_api(FakeWebSocket([
        json.dumps(command(OK, topic="NO_SUCH_TOPIC")),
        json.dumps(command(OK, name="Hello")),
    ]))
    await asyncio.wait_for(relay.commands.join(), 3)
    assert [result["outcome"] for result in relay.results] == [main.FAILED, main.CONFIRMED]


# ── What the browser is told ─────────────────────────────────────────────────────────────


async def test_the_relay_answers_a_command_with_its_verdict(relay, worker, pub_sub, fast_timeouts):
    """The browser's own request is never echoed back: an echo is indistinguishable between a
    command the robot took and one it refused."""
    frame = command(OK, name="Hello")
    ws = FakeWebSocket([json.dumps(frame)])
    await main.ws_api(ws)
    await asyncio.wait_for(relay.commands.join(), 3)
    assert ws.sent == [
        {
            "type": "command_result",
            "reqId": None,
            "command_name": "Hello",
            "outcome": main.CONFIRMED,
            "code": 0,
            "detail": None,
        }
    ]


async def test_a_command_result_carries_the_request_id_the_browser_sent(relay, worker, pub_sub, fast_timeouts):
    pub_sub.behaviour = {FAILS: ("code", 3203)}
    frames = [
        json.dumps({**command(OK, name="Hello"), "reqId": 41}),
        json.dumps({**command(FAILS, name="BadCmd"), "reqId": 42}),
    ]
    ws = FakeWebSocket(frames)
    await main.ws_api(ws)
    await asyncio.wait_for(relay.commands.join(), 3)
    assert [(result["reqId"], result["outcome"]) for result in ws.sent] == [
        (41, main.CONFIRMED),
        (42, main.FAILED),
    ]


async def test_a_cue_answers_with_one_result_for_its_request_id(relay, worker, pub_sub, fast_timeouts):
    ws = FakeWebSocket([json.dumps({**nested(*cue(OK, OK)), "reqId": 7})])
    await main.ws_api(ws)
    await asyncio.wait_for(relay.commands.join(), 3)
    assert [(result["reqId"], result["outcome"]) for result in ws.sent] == [(7, main.CONFIRMED)]


async def test_the_request_id_is_relay_local_and_never_reaches_the_robot(relay, worker, pub_sub, fast_timeouts):
    await main.ws_api(FakeWebSocket([json.dumps({**command(OK), "reqId": 99})]))
    await asyncio.wait_for(relay.commands.join(), 3)
    assert pub_sub.sent[0]["options"] == {"api_id": OK}


# ── Whether the robot is reachable ───────────────────────────────────────────────────────


def test_no_connection_means_the_robot_is_not_reachable(session):
    session.conn = None
    assert session.robot_is_reachable(1000.0) is False


def test_a_channel_that_has_not_validated_yet_is_not_reachable(session, pub_sub):
    """Reading the flag at the moment connect returns is what reports false for a connection
    that then works, so the answer has to be re-read rather than emitted once."""
    session.conn = FakeConnection(pub_sub, opened=False)
    assert session.robot_is_reachable(1000.0) is False
    session.conn.datachannel.data_channel_opened = True
    assert session.robot_is_reachable(1001.0) is True


def test_the_robot_is_gone_once_three_heartbeat_intervals_go_unanswered(session, pub_sub):
    session.conn = FakeConnection(pub_sub)
    opened = 1000.0
    assert session.robot_is_reachable(opened) is True
    assert session.robot_is_reachable(opened + 5) is True, "still inside three intervals"
    assert session.robot_is_reachable(opened + 7) is False, "three intervals unanswered"


def test_a_heartbeat_reply_keeps_the_robot_reachable(session, pub_sub):
    session.conn = FakeConnection(pub_sub)
    opened = 1000.0
    session.robot_is_reachable(opened)
    session.conn.datachannel.heartbeat.heartbeat_response = opened + 6
    assert session.robot_is_reachable(opened + 7) is True
    assert session.robot_is_reachable(opened + 13) is False


def test_a_closed_channel_re_arms_the_watchdog_for_the_next_connection(session, pub_sub):
    """The grace period must start again when the channel reopens, not from the first time it
    was ever seen open."""
    session.conn = FakeConnection(pub_sub)
    session.robot_is_reachable(1000.0)
    session.conn.datachannel.data_channel_opened = False
    assert session.robot_is_reachable(1001.0) is False
    session.conn.datachannel.data_channel_opened = True
    assert session.robot_is_reachable(1100.0) is True


async def test_robot_state_is_sent_on_every_transition_and_only_on_a_transition(session, pub_sub, gui):
    session.conn = FakeConnection(pub_sub, opened=False)
    await session.report_robot_state()
    session.conn.datachannel.data_channel_opened = True
    await session.report_robot_state()
    await session.report_robot_state()
    session.conn.datachannel.data_channel_opened = False
    await session.report_robot_state()
    assert gui.sent == [
        {"type": "robot_state", "connected": False},
        {"type": "robot_state", "connected": True},
        {"type": "robot_state", "connected": False},
    ]


async def test_disconnecting_tells_the_browser_without_waiting_for_the_next_poll(session, pub_sub, gui):
    connection = FakeConnection(pub_sub)
    session.conn = connection
    await session.report_robot_state()
    await session.disconnect()
    assert connection.disconnected and session.conn is None
    assert [message["connected"] for message in gui.sent] == [True, False]


async def test_a_browser_that_connects_is_told_the_state_it_has_not_heard(relay, pub_sub, gui):
    """A page reload is a listener that knows nothing, so the answer must be stated again
    rather than suppressed as unchanged from what the previous page was told."""
    relay.conn = FakeConnection(pub_sub)
    await relay.report_robot_state()
    assert [message["connected"] for message in gui.sent] == [True]

    reloaded = FakeWebSocket([])
    await main.ws_api(reloaded)
    assert relay.reported_reachable is None
    await relay.report_robot_state()
    assert [message["connected"] for message in reloaded.sent] == [True]


async def test_the_watcher_reports_a_channel_that_opens_after_connect_returned(session, pub_sub, gui):
    session.conn = FakeConnection(pub_sub, opened=False)
    watcher = asyncio.get_running_loop().create_task(session.watch_robot(poll=0.01))
    await asyncio.sleep(0.05)
    session.conn.datachannel.data_channel_opened = True
    await asyncio.sleep(0.05)
    watcher.cancel()

    assert [message["connected"] for message in gui.sent] == [False, True]


# ── Checkpoint 1 regressions, now that a harness exists ──────────────────────────────────


async def test_a_malformed_frame_leaves_the_receive_loop_reading(relay, worker, pub_sub, fast_timeouts):
    ws = FakeWebSocket(["{ this is not json", json.dumps(command(OK, name="Hello"))])
    await main.ws_api(ws)
    await asyncio.wait_for(relay.commands.join(), 3)
    assert [result["command_name"] for result in relay.results] == ["Hello"]
    assert [result["command_name"] for result in ws.sent] == ["Hello"]


async def test_a_lidar_frame_reaches_toggle_lidar(relay, monkeypatch):
    switches = []

    async def record(switch):
        switches.append(switch)

    monkeypatch.setattr(relay, "toggleLidar", record)
    await main.ws_api(FakeWebSocket([json.dumps({"command_name": "lidar", "switch": True})]))
    assert switches == [True]


async def test_the_joystick_never_waits_for_a_reply(session, pub_sub):
    """rt/wirelesscontroller answers nothing, so awaiting a reply hangs on the first press."""
    await session.send_joystick_command(0.2, 0.0, 0.0, 0.0)
    assert pub_sub.sent == [
        {
            "topic": "rt/wirelesscontroller",
            "data": {"lx": 0.2, "ly": 0.0, "rx": 0.0, "ry": 0.0, "keys": 0},
            "awaited": False,
        }
    ]


# ── The driver's own bookkeeping ─────────────────────────────────────────────────────────


async def test_a_timed_out_request_leaves_nothing_pending(driver_pub_sub):
    with pytest.raises(asyncio.TimeoutError):
        await driver_pub_sub.publish_request_new(TOPIC, {"api_id": OK}, timeout=0.01)
    assert driver_pub_sub.future_resolver.pending_callbacks == {}
    assert driver_pub_sub.future_resolver.chunk_data_storage == {}


async def test_a_reply_arriving_after_its_timeout_raises_nothing(driver_pub_sub):
    with pytest.raises(asyncio.TimeoutError):
        await driver_pub_sub.publish_request_new(TOPIC, {"api_id": OK}, timeout=0.01)
    request_id = driver_pub_sub.channel.sent[0]["data"]["header"]["identity"]["id"]
    driver_pub_sub.run_resolve(reply_for(OK, 0, request_id=request_id))


async def test_the_resolver_skips_a_future_that_already_settled(driver_pub_sub):
    """set_result on a cancelled future raises InvalidStateError inside on_message."""
    resolver = driver_pub_sub.future_resolver
    loop = asyncio.get_running_loop()
    settled, waiting = loop.create_future(), loop.create_future()
    resolver.save_resolve("req", TOPIC, settled, 4242)
    resolver.save_resolve("req", TOPIC, waiting, 4242)
    settled.cancel()

    driver_pub_sub.run_resolve(reply_for(OK, 0, request_id=4242))

    assert settled.cancelled()
    assert waiting.result()["data"]["header"]["identity"]["id"] == 4242


async def test_request_ids_never_collide_within_a_session(driver_pub_sub):
    """Two requests in the same millisecond used to be able to share an id, and since the
    resolver keys on the bare id, a collision resolved the wrong request's future."""
    for api_id in (OK, FAILS, MUTE):
        with pytest.raises(asyncio.TimeoutError):
            await driver_pub_sub.publish_request_new(TOPIC, {"api_id": api_id}, timeout=0.001)
    ids = [frame["data"]["header"]["identity"]["id"] for frame in driver_pub_sub.channel.sent]
    assert ids == list(range(ids[0], ids[0] + 3))


async def test_a_reply_for_another_api_id_is_not_read_as_the_answer(driver_pub_sub):
    request = asyncio.ensure_future(
        driver_pub_sub.publish_request_new(TOPIC, {"api_id": OK}, timeout=1)
    )
    await asyncio.sleep(0.01)
    request_id = driver_pub_sub.channel.sent[0]["data"]["header"]["identity"]["id"]

    driver_pub_sub.run_resolve(reply_for(FAILS, 0, request_id=request_id))

    reply = await request
    assert reply is None
    assert main.outcome_of(reply)[0] == main.UNKNOWN


async def test_a_closed_channel_raises_instead_of_waiting_out_the_timeout(driver_pub_sub):
    driver_pub_sub.channel.readyState = "closed"
    started = time.perf_counter()
    with pytest.raises(Exception, match="Data channel is not open"):
        await driver_pub_sub.publish_request_new(TOPIC, {"api_id": OK}, timeout=5)
    assert time.perf_counter() - started < 1
    assert driver_pub_sub.future_resolver.pending_callbacks == {}


async def test_a_timeout_leaves_another_caller_on_the_same_key_waiting(driver_pub_sub):
    """Requests with no id share the key "msg $ topic", so cleanup must be per future."""
    resolver = driver_pub_sub.future_resolver
    waiting = asyncio.get_running_loop().create_future()
    resolver.save_resolve("msg", TOPIC, waiting, None)

    with pytest.raises(asyncio.TimeoutError):
        await driver_pub_sub.publish(TOPIC, {"anything": 1}, "msg", timeout=0.01)

    assert resolver.pending_callbacks == {f"msg $ {TOPIC}": [waiting]}
    assert not waiting.done()


async def test_an_err_message_reaches_the_registered_caller(driver_pub_sub):
    seen = []
    driver_pub_sub.set_on_err_callback(seen.append)
    driver_pub_sub.run_resolve({"type": "err", "info": "Invalid Topic.xx"})
    assert seen == [{"type": "err", "info": "Invalid Topic.xx"}]


# ── The robot's fault broadcast ──────────────────────────────────────────────────────────


def test_a_bare_triple_fault_payload_does_not_raise(capsys):
    """add_error and rm_error each carry one flat [timestamp, source, code] triple."""
    handle_error({"type": "add_error", "data": [1765000000, 100, 1]})
    assert capsys.readouterr().out.count("Error Received from Go2") == 1


def test_a_fault_snapshot_reads_every_triple(capsys):
    handle_error({"type": "errors", "data": [[1765000000, 100, 1], [1765000000, 300, 16]]})
    assert capsys.readouterr().out.count("Error Received from Go2") == 2


def test_an_empty_fault_snapshot_does_not_raise(capsys):
    handle_error({"type": "errors", "data": []})
    assert capsys.readouterr().out == ""
