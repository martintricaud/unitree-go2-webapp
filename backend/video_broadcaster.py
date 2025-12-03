# video_broadcaster.py
import asyncio
from typing import Optional

class FrameBroadcaster:
    """
    Holds the latest frame as bytes. Consumers can await get_frame() for next frame.
    """
    def __init__(self):
        self._latest: Optional[bytes] = None
        self._event = asyncio.Event()
        self._lock = asyncio.Lock()

    async def publish(self, jpeg_bytes: bytes):
        async with self._lock:
            self._latest = jpeg_bytes
            self._event.set()
            self._event = asyncio.Event()

    async def get_frame(self, timeout: float | None = None) -> Optional[bytes]:
        if self._latest is not None:
            return self._latest
        try:
            if timeout is None:
                await self._event.wait()
            else:
                await asyncio.wait_for(self._event.wait(), timeout)
        except asyncio.TimeoutError:
            return self._latest
        return self._latest