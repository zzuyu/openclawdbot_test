import json

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.mark.parametrize("room_id", ["t1"])
def test_ws_join_and_chat(room_id: str):
    c = TestClient(app)
    with c.websocket_connect("/ws") as ws:
        ws.send_text(json.dumps({"type": "join", "data": {"name": "A", "roomId": room_id}}))
        joined = json.loads(ws.receive_text())
        assert joined["type"] == "joined"
        assert joined["data"]["roomId"] == room_id

        state = json.loads(ws.receive_text())
        assert state["type"] == "state"

        ws.send_text(json.dumps({"type": "chat", "data": {"text": "hello"}}))

        # Server may broadcast state updates; consume until we see the chat echo.
        for _ in range(10):
            m = json.loads(ws.receive_text())
            if m.get("type") == "chat":
                assert m["data"]["text"] == "hello"
                break
        else:
            raise AssertionError("Did not receive chat message")
