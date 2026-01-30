import json
import time

from fastapi.testclient import TestClient

from app.main import app


def test_round_end_round_emits_roundover():
    # Smoke test: round can end and emits roundOver.
    c = TestClient(app)
    with c.websocket_connect("/ws") as ws:
        ws.send_text(json.dumps({"type": "join", "data": {"name": "A", "roomId": "timer"}}))
        _ = ws.receive_text()  # joined
        _ = ws.receive_text()  # state

        # Start a round
        ws.send_text(json.dumps({"type": "startRound"}))

        # Consume until we see a state with startedMs
        started = False
        deadline = time.time() + 2
        while time.time() < deadline:
            m = json.loads(ws.receive_text())
            if m.get("type") == "state" and m["data"]["round"]["startedMs"]:
                started = True
                break
        assert started

        # Now shorten the room duration via /api is not available; but we can rely on default 60s
        # Instead we just skip the round to assert the end_round path works.
        ws.send_text(json.dumps({"type": "skipRound"}))

        # Expect roundOver
        for _ in range(10):
            m = json.loads(ws.receive_text())
            if m.get("type") == "roundOver":
                assert m["data"]["reason"] in {"skip", "timeout", "guessed", "drawer_left"}
                break
        else:
            raise AssertionError("Did not receive roundOver")
