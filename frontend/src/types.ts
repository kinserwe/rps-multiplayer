export type Move = "rock" | "paper" | "scissors";


export interface Room {
    id: string;
    player1: string | null;
    player2: string | null;
}


export type PlayerJoinEvent = {
    type: "player_joined";
    player_id: string;
    room_state: "waiting" | "ready";
}


export type RoundStartEvent = {
    type: "round_start"
    round: number;
    p1_score: number;
    p2_score: number;
}


export type MoveAckEvent = {
    type: "move_ack";
}


export type RoundResultEvent = {
    type: "round_result";
    winner: string | null;
    p1_choice: Move;
    p2_choice: Move;
    p1_score: number;
    p2_score: number;
    round: number;
}

export type GameFinishedEvent = {
    type: "game_finished";
    winner: string | null;
    p1_score: number;
    p2_score: number;
}

export type ChatMessage = {
    type: "chat";
    message: string;
}


export type WebSocketEvent = PlayerJoinEvent | RoundStartEvent | MoveAckEvent | RoundResultEvent | GameFinishedEvent | ChatMessage;