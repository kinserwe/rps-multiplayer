from uuid import UUID

from fastapi import APIRouter, Depends
from starlette.websockets import WebSocket, WebSocketDisconnect

from src.rooms.schemas import Room
from src.rooms.services import RoomService, get_room_service

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.post("/")
async def create_room(room_service: RoomService = Depends(get_room_service)) -> Room:
    room = await room_service.create_room()
    return room


@router.get("/")
async def list_rooms(
    room_service: RoomService = Depends(get_room_service),
) -> list[Room]:
    rooms = await room_service.list_rooms()
    return rooms


@router.delete("/{room_id}")
async def delete_room(
    room_id: UUID, room_service: RoomService = Depends(get_room_service)
) -> None:
    await room_service.delete_room(room_id)


@router.websocket("/ws/{room_id}")
async def websocket_room(websocket: WebSocket, room_id: UUID) -> None:
    await websocket.accept()

    room_service = get_room_service()

    player_id_str = websocket.query_params.get("player_id")
    if not player_id_str:
        await websocket.close(code=1008)

    player_id = UUID(player_id_str)

    try:
        room = await room_service.join_room(room_id, player_id)

        await websocket.send_json({"event": "joined", "room": room.model_dump()})
    except WebSocketDisconnect:
        pass
