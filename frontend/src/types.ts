export const SIGNS = ["rock", "paper", "scissors"] as const;
export type Sign = (typeof SIGNS)[number];

export interface Room {
    id: string;
    player1: string | null;
    player2: string | null;
}
