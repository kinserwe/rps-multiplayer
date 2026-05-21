import type {
    ChatMessage,
    GameFinishedEvent,
    MoveAckEvent,
    PlayerJoinEvent,
    RoundResultEvent,
    RoundStartEvent,
    WebSocketEvent
} from "./types.ts";

export function isPlayerJoinEvent(event: WebSocketEvent): event is PlayerJoinEvent {
    return event.type === "player_joined";
}

export function isRoundStartEvent(event: WebSocketEvent): event is RoundStartEvent {
    return event.type === "round_start";
}

export function isMoveAckEvent(event: WebSocketEvent): event is MoveAckEvent {
    return event.type === "move_ack";
}

export function isRoundResultEvent(event: WebSocketEvent): event is RoundResultEvent {
    return event.type === "round_result";
}

export function isGameFinishedEvent(event: WebSocketEvent): event is GameFinishedEvent {
    return event.type === "game_finished";
}

export function isChatMessage(event: WebSocketEvent): event is ChatMessage {
    return event.type === "chat";
}
