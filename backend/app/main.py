from __future__ import annotations

import asyncio
import json
import random
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="你画我猜 Demo")

# In dev we run Vite on 18789. Allow it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

WORDS = [
    "熊猫",
    "饺子",
    "火锅",
    "长城",
    "京剧",
    "灯笼",
    "龙",
    "竹子",
    "汉服",
    "月饼",
    "扇子",
    "故宫",
]


def now_ms() -> int:
    return int(time.time() * 1000)


@dataclass
class Player:
    name: str
    ws: WebSocket
    joined_ms: int = field(default_factory=now_ms)
    score: int = 0


@dataclass
class Room:
    room_id: str
    players: dict[str, Player] = field(default_factory=dict)  # key: client_id
    drawer_id: str | None = None
    word: str | None = None
    round_started_ms: int | None = None
    round_duration_s: int = 60

    # Keep last N draw events so late joiners see something.
    draw_log: list[dict[str, Any]] = field(default_factory=list)

    def public_state(self) -> dict[str, Any]:
        return {
            "roomId": self.room_id,
            "players": [
                {"id": cid, "name": p.name, "score": p.score}
                for cid, p in self.players.items()
            ],
            "drawerId": self.drawer_id,
            "round": {
                "startedMs": self.round_started_ms,
                "durationS": self.round_duration_s,
            },
        }


ROOMS: dict[str, Room] = {}
ROOM_LOCK = asyncio.Lock()


async def send(ws: WebSocket, type_: str, data: Any):
    await ws.send_text(json.dumps({"type": type_, "data": data}))


async def broadcast(room: Room, type_: str, data: Any, *, exclude: set[str] | None = None):
    exclude = exclude or set()
    dead: list[str] = []
    for cid, player in list(room.players.items()):
        if cid in exclude:
            continue
        try:
            await send(player.ws, type_, data)
        except Exception:
            dead.append(cid)
    for cid in dead:
        room.players.pop(cid, None)


def choose_drawer(room: Room) -> str | None:
    if not room.players:
        return None
    # Rotate drawer fairly based on join time.
    ordered = sorted(room.players.items(), key=lambda kv: kv[1].joined_ms)
    if room.drawer_id is None:
        return ordered[0][0]
    ids = [cid for cid, _ in ordered]
    try:
        i = ids.index(room.drawer_id)
        return ids[(i + 1) % len(ids)]
    except ValueError:
        return ordered[0][0]


async def start_round(room: Room):
    room.drawer_id = choose_drawer(room)
    room.word = random.choice(WORDS)
    room.round_started_ms = now_ms()
    room.draw_log.clear()

    # Tell everyone the public state.
    await broadcast(room, "state", room.public_state())

    # Tell drawer the word; others get masked.
    if room.drawer_id and room.drawer_id in room.players:
        await send(room.players[room.drawer_id].ws, "word", {"word": room.word})
    await broadcast(room, "word", {"word": "_" * len(room.word or "")}, exclude={room.drawer_id or ""})


async def maybe_end_round(room: Room):
    if room.round_started_ms is None:
        return
    if (time.time() - (room.round_started_ms / 1000)) >= room.round_duration_s:
        # Round over; reveal word.
        await broadcast(room, "roundOver", {"word": room.word})
        room.round_started_ms = None
        room.word = None


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/rooms")
async def list_rooms():
    async with ROOM_LOCK:
        return {
            "rooms": [
                {
                    "roomId": r.room_id,
                    "players": len(r.players),
                    "inRound": bool(r.round_started_ms),
                }
                for r in ROOMS.values()
            ]
        }


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()

    client_id = f"c{random.randint(100000, 999999)}"
    room: Room | None = None

    try:
        # First message must be join.
        raw = await ws.receive_text()
        msg = json.loads(raw)
        if msg.get("type") != "join":
            await send(ws, "error", {"message": "First message must be join"})
            await ws.close()
            return

        name = str(msg.get("data", {}).get("name") or "游客")[:24]
        room_id = str(msg.get("data", {}).get("roomId") or "lobby")[:24]

        async with ROOM_LOCK:
            room = ROOMS.get(room_id)
            if room is None:
                room = Room(room_id=room_id)
                ROOMS[room_id] = room
            room.players[client_id] = Player(name=name, ws=ws)

        await send(ws, "joined", {"clientId": client_id, "roomId": room_id})
        await send(ws, "state", room.public_state())
        # replay draw log
        if room.draw_log:
            await send(ws, "drawReplay", {"events": room.draw_log})

        await broadcast(room, "chat", {"system": True, "text": f"{name} 加入房间"}, exclude={client_id})
        await broadcast(room, "state", room.public_state())

        while True:
            await maybe_end_round(room)
            raw = await ws.receive_text()
            msg = json.loads(raw)
            t = msg.get("type")
            data = msg.get("data") or {}

            if t == "startRound":
                # Anyone can start; for demo simplicity.
                await start_round(room)

            elif t == "chat":
                text = str(data.get("text") or "")[:200]
                player = room.players.get(client_id)
                if not player:
                    continue

                # Guess check
                if room.word and room.drawer_id != client_id:
                    normalized = text.strip().lower()
                    if normalized and normalized == room.word.strip().lower():
                        player.score += 10
                        await broadcast(room, "chat", {"system": True, "text": f"{player.name} 猜对了！+10"})
                        await broadcast(room, "state", room.public_state())
                        await broadcast(room, "roundOver", {"word": room.word})
                        room.round_started_ms = None
                        room.word = None
                        continue

                await broadcast(room, "chat", {"name": player.name, "text": text})

            elif t == "draw":
                # Only drawer can draw during round.
                if room.drawer_id != client_id or room.round_started_ms is None:
                    continue
                evt = {
                    "kind": str(data.get("kind") or "stroke"),
                    "points": data.get("points") or [],
                    "color": str(data.get("color") or "#1f2937"),
                    "size": float(data.get("size") or 4),
                }
                # cap size / points
                evt["size"] = max(1.0, min(24.0, evt["size"]))
                if isinstance(evt["points"], list):
                    evt["points"] = evt["points"][:200]
                room.draw_log.append(evt)
                room.draw_log[:] = room.draw_log[-800:]
                await broadcast(room, "draw", evt, exclude={client_id})

            elif t == "clear":
                if room.drawer_id != client_id:
                    continue
                room.draw_log.clear()
                await broadcast(room, "clear", {})

            else:
                await send(ws, "error", {"message": f"Unknown type: {t}"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await send(ws, "error", {"message": str(e)})
        except Exception:
            pass
    finally:
        if room is not None:
            async with ROOM_LOCK:
                p = room.players.pop(client_id, None)
                if room.players:
                    await broadcast(room, "chat", {"system": True, "text": f"{(p.name if p else '有人')} 离开房间"})
                    await broadcast(room, "state", room.public_state())
                else:
                    # cleanup empty room
                    ROOMS.pop(room.room_id, None)
