import {useCallback, useEffect, useRef, useState} from "react";
import axios from "axios";
import type {Move, Room, WebSocketEvent} from "./types.ts";
import {
    isChatMessage,
    isGameFinishedEvent,
    isMoveAckEvent,
    isPlayerJoinEvent,
    isRoundResultEvent,
    isRoundStartEvent,
} from "./utils.ts";

type GamePhase = "waiting" | "playing" | "moved" | "result" | "finished";

type RoundResult = {
    myChoice: Move;
    oppChoice: Move;
    winner: "you" | "opponent" | "tie";
    round: number;
};

type GameResult = {
    winner: "you" | "opponent" | "tie";
    myScore: number;
    oppScore: number;
};

const EMOJI: Record<Move, string> = {rock: "🪨", paper: "📄", scissors: "✂️"};

export default function App() {
    const [screen, setScreen] = useState<"lobby" | "game">("lobby");
    const [rooms, setRooms] = useState<Room[]>([]);
    const [selectedRoom, setSelectedRoom] = useState<string | null>(null);

    const [phase, setPhaseState] = useState<GamePhase>("waiting");
    const [myScore, setMyScore] = useState(0);
    const [oppScore, setOppScore] = useState(0);
    const [currentRound, setCurrentRound] = useState(1);
    const [statusMsg, setStatusMsg] = useState("");
    const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
    const [gameResult, setGameResult] = useState<GameResult | null>(null);
    const [myLastMove, setMyLastMove] = useState<Move | null>(null);
    const [chatMessages, setChatMessages] = useState<string[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [connecting, setConnecting] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const phaseRef = useRef<GamePhase>("waiting");
    const playerIdRef = useRef<string | null>(null);
    const isP1Ref = useRef<boolean | null>(null);
    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const expectingAckRef = useRef(false);

    const setPhase = (p: GamePhase) => {
        phaseRef.current = p;
        setPhaseState(p);
    };

    const fetchRooms = useCallback(() => {
        axios.get<Room[]>("http://localhost:8001/rooms").then((r) => setRooms(r.data));
    }, []);

    useEffect(() => {
        fetchRooms();
    }, [fetchRooms]);

    // Auto-refresh room list every 3 s while on lobby
    useEffect(() => {
        if (screen !== "lobby") return;
        const id = setInterval(fetchRooms, 3000);
        return () => clearInterval(id);
    }, [screen, fetchRooms]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({behavior: "smooth"});
    }, [chatMessages]);

    const createRoom = async () => {
        await axios.post("http://localhost:8001/rooms");
        fetchRooms();
    };

    const joinRoom = (roomId: string) => {
        if (wsRef.current || connecting) return;

        const pid = crypto.randomUUID();
        playerIdRef.current = pid;
        isP1Ref.current = null;
        setConnecting(true);

        setPhase("waiting");
        setMyScore(0);
        setOppScore(0);
        setCurrentRound(1);
        setRoundResult(null);
        setGameResult(null);
        setMyLastMove(null);
        setChatMessages([]);

        const ws = new WebSocket(`ws://localhost:8001/rooms/ws/${roomId}?player_id=${pid}`);

        ws.addEventListener("open", () => {
            setConnecting(false);
            setSelectedRoom(roomId);
            setScreen("game");
            setStatusMsg("Waiting for opponent...");
        });

        ws.addEventListener("message", (e) => {
            const data = JSON.parse(e.data) as WebSocketEvent;

            if (isPlayerJoinEvent(data)) {
                if (data.player_id === pid && isP1Ref.current === null) {
                    isP1Ref.current = data.room_state === "waiting";
                }
                setStatusMsg(data.room_state === "ready" ? "Opponent joined! Starting..." : "Waiting for opponent...");
            } else if (isRoundStartEvent(data)) {
                expectingAckRef.current = false;
                const p1 = isP1Ref.current ?? true;
                setCurrentRound(data.round);
                setMyScore(p1 ? data.p1_score : data.p2_score);
                setOppScore(p1 ? data.p2_score : data.p1_score);
                setPhase("playing");
                setRoundResult(null);
                setMyLastMove(null);
                setStatusMsg(`Round ${data.round} — Choose your move!`);
            } else if (isMoveAckEvent(data)) {
                if (expectingAckRef.current) {
                    expectingAckRef.current = false;
                    setPhase("moved");
                    setStatusMsg("Move locked! Waiting for opponent...");
                }
            } else if (isRoundResultEvent(data)) {
                expectingAckRef.current = false;
                const p1 = isP1Ref.current ?? true;
                const myChoice = p1 ? data.p1_choice : data.p2_choice;
                const oppChoice = p1 ? data.p2_choice : data.p1_choice;
                setMyScore(p1 ? data.p1_score : data.p2_score);
                setOppScore(p1 ? data.p2_score : data.p1_score);

                let winner: "you" | "opponent" | "tie";
                if (data.winner === null) winner = "tie";
                else if (data.winner === pid) winner = "you";
                else winner = "opponent";

                setRoundResult({myChoice, oppChoice, winner, round: data.round});
                setPhase("result");
                setStatusMsg(
                    winner === "you" ? `You won round ${data.round}!` :
                        winner === "opponent" ? `Opponent won round ${data.round}` :
                            `Tie — round ${data.round}`
                );
            } else if (isGameFinishedEvent(data)) {
                const p1 = isP1Ref.current ?? true;
                let winner: "you" | "opponent" | "tie";
                if (data.winner === null) winner = "tie";
                else if (data.winner === pid) winner = "you";
                else winner = "opponent";
                setGameResult({
                    winner,
                    myScore: p1 ? data.p1_score : data.p2_score,
                    oppScore: p1 ? data.p2_score : data.p1_score,
                });
                setPhase("finished");
            } else if (isChatMessage(data)) {
                setChatMessages((prev) => [...prev, data.message]);
            }
        });

        ws.addEventListener("close", () => {
            wsRef.current = null;
            setConnecting(false);
            if (phaseRef.current !== "finished") {
                setScreen("lobby");
                setSelectedRoom(null);
                fetchRooms();
            }
        });

        wsRef.current = ws;
    };

    const sendMove = (move: Move) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || phaseRef.current !== "playing") return;
        expectingAckRef.current = true;
        setMyLastMove(move);
        ws.send(JSON.stringify({event_type: "move", move, player_id: playerIdRef.current}));
    };

    const sendChat = () => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !chatInput.trim()) return;
        ws.send(JSON.stringify({event_type: "chat", message: chatInput.trim()}));
        setChatInput("");
    };

    const leaveRoom = () => {
        wsRef.current?.send(JSON.stringify({event_type: "disconnect"}));
        wsRef.current?.close();
        setScreen("lobby");
        setSelectedRoom(null);
        fetchRooms();
    };

    // ─── Lobby ────────────────────────────────────────────────────────────────

    if (screen === "lobby") {
        return (
            <div className="min-h-screen bg-[#08080d] text-white flex flex-col items-center justify-center p-8">
                <div className="w-full max-w-sm">
                    {/* Header */}
                    <div className="text-center mb-10">
                        <div className="flex justify-center gap-3 mb-5">
                            {(["rock", "paper", "scissors"] as Move[]).map((m) => (
                                <div
                                    key={m}
                                    className="w-16 h-16 rounded-2xl bg-[#12121e] border border-[#1e1e30] flex items-center justify-center text-3xl"
                                >
                                    {/* Replace with <img src={`/images/${m}.png`} alt={m} className="w-10 h-10" /> */}
                                    {EMOJI[m]}
                                </div>
                            ))}
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Rock Paper Scissors</h1>
                        <p className="text-gray-600 text-xs mt-1 tracking-wide">MULTIPLAYER · BEST OF 5</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mb-5">
                        <button
                            onClick={createRoom}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold py-2.5 rounded-xl text-sm transition-all"
                        >
                            + New Room
                        </button>
                        <button
                            onClick={fetchRooms}
                            title="Refresh"
                            className="bg-[#12121e] hover:bg-[#1a1a2e] border border-[#1e1e30] text-gray-500 py-2.5 px-4 rounded-xl text-sm transition-colors"
                        >
                            ↻
                        </button>
                    </div>

                    {/* Room list */}
                    <div className="space-y-2">
                        {rooms.length === 0 ? (
                            <div
                                className="text-center py-10 text-gray-700 text-sm rounded-2xl border border-[#12121e]">
                                No open rooms — create one!
                            </div>
                        ) : (
                            rooms.map((room) => {
                                const playerCount = [room.player1, room.player2].filter(Boolean).length;
                                const full = playerCount >= 2;
                                const disabled = full || connecting;
                                return (
                                    <div
                                        key={room.id}
                                        onClick={() => !disabled && joinRoom(room.id)}
                                        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                                            disabled
                                                ? "border-[#161620] bg-[#0e0e18] cursor-not-allowed opacity-40"
                                                : "border-[#1e1e30] bg-[#12121e] hover:border-indigo-500/50 hover:bg-[#16162a] cursor-pointer"
                                        }`}
                                    >
                                        <div>
                                            <span
                                                className="font-mono text-xs text-gray-400">{room.id.slice(0, 8)}…</span>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                {[0, 1].map((i) => (
                                                    <div
                                                        key={i}
                                                        className={`w-1.5 h-1.5 rounded-full ${i < playerCount ? "bg-emerald-500" : "bg-gray-700"}`}
                                                    />
                                                ))}
                                                <span className="text-[10px] text-gray-600">{playerCount}/2</span>
                                            </div>
                                        </div>
                                        <span
                                            className={`text-xs font-semibold ${full ? "text-gray-700" : connecting ? "text-gray-600" : "text-indigo-400"}`}>
                      {full ? "Full" : connecting ? "…" : "Join →"}
                    </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ─── Game ─────────────────────────────────────────────────────────────────

    const canMove = phase === "playing";

    return (
        <div className="min-h-screen bg-[#08080d] text-white flex flex-col">
            {/* Top bar */}
            <header className="flex items-center justify-between px-5 py-3 border-b border-[#12121e]">
        <span className="font-mono text-[11px] text-gray-600">
          room <span className="text-gray-500">{selectedRoom?.slice(0, 8)}…</span>
        </span>
                <button
                    onClick={leaveRoom}
                    className="text-[11px] text-gray-700 hover:text-red-500 transition-colors"
                >
                    Leave
                </button>
            </header>

            <main className="flex-1 flex flex-col items-center justify-between p-6 max-w-sm mx-auto w-full gap-6">
                {/* Scoreboard */}
                <div
                    className="w-full flex items-center bg-[#12121e] border border-[#1e1e30] rounded-2xl overflow-hidden">
                    <div className="flex-1 text-center py-5">
                        <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-1">You</div>
                        <div className="text-5xl font-black tabular-nums">{myScore}</div>
                    </div>
                    <div className="flex flex-col items-center px-4 border-x border-[#1e1e30]">
                        <span className="text-[9px] text-gray-700 uppercase tracking-widest">vs</span>
                        <span className="text-xs text-gray-600 mt-1.5 font-mono">R{currentRound}/5</span>
                    </div>
                    <div className="flex-1 text-center py-5">
                        <div className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mb-1">Opp</div>
                        <div className="text-5xl font-black tabular-nums">{oppScore}</div>
                    </div>
                </div>

                {/* Status */}
                <div className="w-full text-center space-y-2 min-h-[4rem] flex flex-col items-center justify-center">
                    <p className="text-sm text-gray-400">{statusMsg}</p>
                    {roundResult && (
                        <div
                            className={`inline-flex items-center gap-2.5 px-4 py-1.5 rounded-xl text-xs border font-medium ${
                                roundResult.winner === "you"
                                    ? "bg-emerald-950/50 border-emerald-800/40 text-emerald-400"
                                    : roundResult.winner === "opponent"
                                        ? "bg-red-950/50 border-red-800/40 text-red-400"
                                        : "bg-amber-950/50 border-amber-800/40 text-amber-400"
                            }`}
                        >
                            <span>You {EMOJI[roundResult.myChoice]} {roundResult.myChoice}</span>
                            <span className="text-gray-700">·</span>
                            <span>Opp {EMOJI[roundResult.oppChoice]} {roundResult.oppChoice}</span>
                        </div>
                    )}
                </div>

                {/* Move cards */}
                <div className="flex gap-3">
                    {(["rock", "paper", "scissors"] as Move[]).map((move) => {
                        const selected = myLastMove === move && (phase === "moved" || phase === "result");
                        return (
                            <button
                                key={move}
                                onClick={() => sendMove(move)}
                                disabled={!canMove}
                                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-150 select-none ${
                                    selected
                                        ? "border-indigo-400 bg-indigo-900/25 scale-105 shadow-lg shadow-indigo-950/50"
                                        : canMove
                                            ? "border-[#1e1e30] bg-[#12121e] hover:border-indigo-500/60 hover:bg-[#15152a] hover:scale-105 cursor-pointer"
                                            : "border-[#111118] bg-[#0d0d15] opacity-25 cursor-not-allowed"
                                }`}
                            >
                                {/* Image placeholder — swap span for <img src={`/images/${move}.png`} ... /> */}
                                <div
                                    className="w-[4.5rem] h-[4.5rem] rounded-xl bg-[#0a0a12] border border-[#181824] flex items-center justify-center">
                                    <span className="text-4xl">{EMOJI[move]}</span>
                                </div>
                                <span
                                    className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 capitalize">
                  {move}
                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Chat */}
                <div className="w-full">
                    <div className="bg-[#12121e] border border-[#1e1e30] rounded-xl p-3 h-20 overflow-y-auto mb-2">
                        {chatMessages.length === 0 ? (
                            <p className="text-center text-gray-800 text-[11px] pt-2">No messages</p>
                        ) : (
                            <>
                                {chatMessages.map((msg, i) => (
                                    <div key={i} className="text-[11px] text-gray-500 leading-5">{msg}</div>
                                ))}
                                <div ref={chatEndRef}/>
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <input
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && sendChat()}
                            placeholder="Say something..."
                            className="flex-1 bg-[#12121e] border border-[#1e1e30] focus:border-indigo-600/50 text-white text-[11px] px-3 py-2 rounded-lg outline-none placeholder-gray-700 transition-colors"
                        />
                        <button
                            onClick={sendChat}
                            className="bg-[#12121e] hover:bg-[#1a1a2e] border border-[#1e1e30] text-gray-500 text-[11px] px-3 py-2 rounded-lg transition-colors"
                        >
                            Send
                        </button>
                    </div>
                </div>
            </main>

            {/* Game over modal */}
            {gameResult && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-20 p-6">
                    <div className="bg-[#12121e] border border-[#1e1e30] rounded-3xl p-8 text-center w-full max-w-xs">
                        <div className="text-6xl mb-4">
                            {gameResult.winner === "you" ? "🏆" : gameResult.winner === "opponent" ? "💀" : "🤝"}
                        </div>
                        <h2
                            className={`text-2xl font-black mb-1 ${
                                gameResult.winner === "you" ? "text-emerald-400" :
                                    gameResult.winner === "opponent" ? "text-red-400" :
                                        "text-amber-400"
                            }`}
                        >
                            {gameResult.winner === "you" ? "Victory!" : gameResult.winner === "opponent" ? "Defeat" : "Draw"}
                        </h2>
                        <p className="text-gray-600 text-sm mb-6 font-mono">
                            {gameResult.myScore} — {gameResult.oppScore}
                        </p>
                        <button
                            onClick={leaveRoom}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-semibold py-3 rounded-xl transition-all text-sm"
                        >
                            Back to Lobby
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
