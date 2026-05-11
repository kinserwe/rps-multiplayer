import uuid

from redis.asyncio import Redis

from src.core.redis_client import redis_client
from src.rooms.schemas import Room


class RoomService:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def create_room(self) -> Room:
        room_id = uuid.uuid4()
        room_key = str(room_id)
        await self.redis.hset(f"room:{room_key}", mapping={"status": "waiting"})
        await self.redis.sadd("rooms", room_key)
        return Room(
            id=room_id,
            player1=None,
            player2=None,
        )

    async def list_rooms(self) -> list[Room]:
        room_ids = await self.redis.smembers("rooms")

        rooms: list[Room] = []

        for room_id in room_ids:
            data = await self.redis.hgetall(f"room:{room_id}")

            if not data:
                continue

            rooms.append(Room.from_redis(uuid.UUID(room_id), data))

        return rooms

    async def delete_room(self, room_id: uuid.UUID) -> None:
        room_key = str(room_id)

        await self.redis.srem("rooms", room_key)
        await self.redis.delete(f"room:{room_key}")

    async def join_room(self, room_id: uuid.UUID, player_id: uuid.UUID) -> Room:
        room_key = f"room:{room_id}"
        player_key = str(player_id)

        while True:
            try:
                await self.redis.watch(room_key)

                room = await self.redis.hgetall(room_key)

                if not room:
                    await self.redis.unwatch()
                    raise ValueError("Room not found")

                if room.get("player1") and room.get("player2"):
                    await self.redis.unwatch()
                    raise ValueError("Room is full")

                pipe = self.redis.pipeline()
                pipe.multi()

                if not room.get("player1"):
                    await pipe.hset(room_key, "player1", player_key)
                else:
                    await pipe.hset(room_key, "player2", player_key)

                await pipe.execute()
                break
            except Exception:
                continue

        updated_room = await self.redis.hgetall(room_key)
        return Room.from_redis(room_id, updated_room)


def get_room_service() -> RoomService:
    return RoomService(redis_client)
