from uuid import UUID

from pydantic import BaseModel

from src.utils import to_uuid


class Room(BaseModel):
    id: UUID
    player1: UUID | None = None
    player2: UUID | None = None

    @classmethod
    def from_redis(cls, room_id: UUID, data: dict) -> "Room":
        return cls(
            id=room_id,
            player1=to_uuid(data.get("player1")),
            player2=to_uuid(data.get("player2")),
        )
