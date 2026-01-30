from __future__ import annotations

import asyncio
import json
import random
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .wordbank import Wordbank, load_wordbank, parse_wordbank_payload, save_wordbank

app = FastAPI(title="你画我猜")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_PATH = __import__("pathlib").Path(__file__).resolve().parent / "data" / "wordbank.json"
WORDBANK: Wordbank = load_wordbank(DATA_PATH)


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
    masked_word: str | None = None
    round_started_ms: int | None = None
    round_duration_s: int = 60
    intermission_s: int = 3

    category: str = "默认"

    # background timer task for round timeout
    timer_task: asyncio.Task | None = None

    # Keep last N draw events so late joiners see something.
    draw_log: list[dict[str, Any]] = field(default_factory=list)

    def public_state(self) -> dict[str, Any]:
        started = self.round_started_ms
        ends = (started + self.round_duration_s * 1000) if started else None
        return {
            "roomId": self.room_id,
            "players": [
                {"id": cid, "name": p.name, "score": p.score}
                for cid, p in self.players.items()
            ],
            "drawerId": self.drawer_id,
            "category": self.category,
            "round": {
                "startedMs": started,
                "endsMs": ends,
                "durationS": self.round_duration_s,
            },
            "phase": "IN_ROUND" if started else "LOBBY",
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


def choose_word(room: Room) -> str:
    cats = WORDBANK.categories
    words = cats.get(room.category) or cats.get("默认") or []
    if not words:
        # should not happen after normalize
        return "熊猫"
    return random.choice(words)


async def _arm_timer(room: Room):
    # cancel old timer
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.timer_task = None

    async def _timer():
        try:
            await asyncio.sleep(room.round_duration_s)
            # Only timeout if still in the same round.
            if room.round_started_ms is not None:
                await end_round(room, reason="timeout")
        except asyncio.CancelledError:
            return

    room.timer_task = asyncio.create_task(_timer())


async def start_round(room: Room, *, force: bool = False):
    # If a round is already running, do nothing unless force.
    if room.round_started_ms is not None and not force:
        return

    room.drawer_id = choose_drawer(room)
    room.word = choose_word(room)
    room.masked_word = "_" * len(room.word or "")
    room.round_started_ms = now_ms()
    room.draw_log.clear()

    await _arm_timer(room)

    await broadcast(room, "state", room.public_state())

    if room.drawer_id and room.drawer_id in room.players:
        await send(room.players[room.drawer_id].ws, "word", {"word": room.word})
    await broadcast(
        room,
        "word",
        {"word": room.masked_word},
        exclude={room.drawer_id or ""},
    )


async def end_round(room: Room, *, reason: str):
    # Cancel timer for this round
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.timer_task = None

    # reveal word and schedule next round
    await broadcast(room, "roundOver", {"word": room.word, "reason": reason})
    room.round_started_ms = None
    room.word = None
    room.masked_word = None

    await broadcast(room, "state", room.public_state())

    # Auto-next round (intermission)
    async def _auto_next():
        await asyncio.sleep(room.intermission_s)
        if room.players:
            await start_round(room)

    asyncio.create_task(_auto_next())


async def maybe_end_round(room: Room):
    # kept for backwards-compat; timeout handled by timer task.
    return


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
                    "category": r.category,
                }
                for r in ROOMS.values()
            ]
        }


@app.get("/api/wordbank")
def get_wordbank():
    return {"categories": WORDBANK.categories}


@app.post("/api/wordbank")
def set_wordbank(payload: dict[str, Any]):
    global WORDBANK
    wb = parse_wordbank_payload(payload)
    save_wordbank(DATA_PATH, wb)
    WORDBANK = wb
    return {"ok": True, "categories": list(WORDBANK.categories.keys())}


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

        # send current masked word if in round
        if room.round_started_ms is not None and room.masked_word is not None:
            # Drawer will get the real word later when round starts; for join mid-round,
            # we only send masked word here.
            await send(ws, "word", {"word": room.masked_word})

        await broadcast(room, "chat", {"system": True, "text": f"{name} 加入房间"}, exclude={client_id})
        await broadcast(room, "state", room.public_state())

        while True:
            await maybe_end_round(room)
            raw = await ws.receive_text()
            msg = json.loads(raw)
            t = msg.get("type")
            data = msg.get("data") or {}

            if t == "startRound":
                # Anyone can start if no round running.
                await start_round(room, force=False)

            elif t == "skipRound":
                # Skip current round (e.g., dead room). Only valid if in round.
                if room.round_started_ms is not None:
                    await end_round(room, reason="skip")

            elif t == "setCategory":
                cat = str(data.get("category") or "默认").strip()[:40]
                if cat not in WORDBANK.categories:
                    cat = "默认"
                room.category = cat
                await broadcast(room, "state", room.public_state())

            elif t == "chat":
                text = str(data.get("text") or "")[:200]
                player = room.players.get(client_id)
                if not player:
                    continue

                # Guess check
                if room.word:
                    normalized = text.strip().lower()
                    can_guess = room.drawer_id != client_id or len(room.players) == 1
                    if can_guess and normalized and normalized == room.word.strip().lower():
                        # Solo mode: allow drawer to guess to advance rounds.
                        if room.drawer_id != client_id:
                            player.score += 10
                            await broadcast(room, "chat", {"system": True, "text": f"{player.name} 猜对了！+10"})
                        else:
                            await broadcast(room, "chat", {"system": True, "text": f"{player.name} 通过（自练模式）"})
                        await broadcast(room, "state", room.public_state())
                        await end_round(room, reason="guessed")
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
                left_name = p.name if p else "有人"

                if room.players:
                    # If the drawer left mid-round, end the round and rotate.
                    if room.drawer_id == client_id and room.round_started_ms is not None:
                        await broadcast(room, "chat", {"system": True, "text": f"{left_name} 离开房间（本轮作废，自动换画手）"})
                        await end_round(room, reason="drawer_left")
                    else:
                        await broadcast(room, "chat", {"system": True, "text": f"{left_name} 离开房间"})
                        await broadcast(room, "state", room.public_state())
                else:
                    # cleanup empty room
                    if room.timer_task and not room.timer_task.done():
                        room.timer_task.cancel()
                    ROOMS.pop(room.room_id, None)
