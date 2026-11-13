"""In-process pub/sub that fans hub events out to every connected Server-Sent Events client."""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator


class EventBus:
    def __init__(self, max_queue: int = 500) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._max_queue = max_queue

    def publish(self, event: dict) -> None:
        data = json.dumps(event, separators=(",", ":"))
        for q in list(self._subscribers):
            if q.full():
                # A slow client: drop its oldest event rather than block the orchestrator.
                with contextlib.suppress(asyncio.QueueEmpty):
                    q.get_nowait()
            q.put_nowait(data)

    async def subscribe(self, first: dict | None = None, heartbeat: float = 15.0) -> AsyncIterator[str]:
        q: asyncio.Queue[str] = asyncio.Queue(self._max_queue)
        self._subscribers.add(q)
        try:
            if first is not None:
                yield f"data: {json.dumps(first, separators=(',', ':'))}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=heartbeat)
                    yield f"data: {data}\n\n"
                except TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            self._subscribers.discard(q)

    @property
    def subscribers(self) -> int:
        return len(self._subscribers)
