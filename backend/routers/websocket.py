"""
WebSocket gateway for real-time incident push notifications.

SCALABILITY NOTE — read before "fixing" this: ConnectionManager below
holds connected sockets in a plain in-process Python list. That's
correct and sufficient for exactly one running backend process. It does
NOT survive horizontal scaling — a second uvicorn worker or container
would have its own independent ConnectionManager with no way to reach
clients connected to the first. The fix is a Redis Pub/Sub backplane,
already scoped for Priority 3 once Redis exists anywhere in this stack
(see docs/Backend_Extension_Plan.md, Step 6). Building that now, before
Redis is wired up anywhere else in the project, would be solving a
scaling problem this hackathon-stage deployment doesn't have yet.
"""
from dataclasses import dataclass

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

router = APIRouter()


@dataclass
class _Connection:
    websocket: WebSocket
    min_lat: float | None = None
    min_lon: float | None = None
    max_lat: float | None = None
    max_lon: float | None = None

    def in_view(self, lat: float, lon: float) -> bool:
        if self.min_lat is None:
            return True  # no viewport filter supplied — this client gets everything
        return self.min_lat <= lat <= self.max_lat and self.min_lon <= lon <= self.max_lon


class ConnectionManager:
    def __init__(self):
        self._connections: list[_Connection] = []

    async def connect(self, websocket: WebSocket, bbox: tuple | None) -> None:
        await websocket.accept()
        conn = _Connection(websocket, *bbox) if bbox else _Connection(websocket)
        self._connections.append(conn)

    def disconnect(self, websocket: WebSocket) -> None:
        self._connections = [c for c in self._connections if c.websocket is not websocket]

    async def broadcast(self, event_type: str, incident: dict) -> None:
        """Sends to every connected client whose viewport contains this
        incident. Iterates a snapshot of the list so a disconnect
        triggered mid-broadcast can't mutate the list out from under us."""
        lat, lon = incident["latitude"], incident["longitude"]
        message = {"type": event_type, "data": incident}
        for conn in list(self._connections):
            if not conn.in_view(lat, lon):
                continue
            try:
                await conn.websocket.send_json(message)
            except Exception:
                self.disconnect(conn.websocket)

    async def broadcast_all(self, event_type: str, data: dict) -> None:
        """Sends to ALL connected clients regardless of viewport.
        Used for dashboard-level events (resources_updated, stats_changed)
        that every authority client needs to know about immediately."""
        message = {"type": event_type, "data": data}
        for conn in list(self._connections):
            try:
                await conn.websocket.send_json(message)
            except Exception:
                self.disconnect(conn.websocket)


manager = ConnectionManager()


@router.websocket("/incidents")
async def incidents_ws(
    websocket: WebSocket,
    minLat: float | None = Query(default=None),
    minLon: float | None = Query(default=None),
    maxLat: float | None = Query(default=None),
    maxLon: float | None = Query(default=None),
):
    bbox = (minLat, minLon, maxLat, maxLon) if minLat is not None else None
    await manager.connect(websocket, bbox)
    try:
        while True:
            # No client -> server messages are expected on this channel;
            # this just awaits something so the coroutine stays alive
            # and we find out promptly when the client disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
