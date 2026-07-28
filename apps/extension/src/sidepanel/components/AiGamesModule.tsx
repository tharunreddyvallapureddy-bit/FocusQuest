import React, { useState } from "react";

type PlayerState = {
  hp: number;
  maxHp: number;
  coins: number;
  intellectXp: number;
  isDead: boolean;
  avatarSeed: string;
  focusMode: boolean;
  username?: string;
  name?: string;
  upiId?: string;
};

type Props = {
  player: PlayerState;
  onGainXp: (xp: number) => void;
};

type Category = "basic" | "moderate" | "adversarial" | "csp";
type ActiveGame =
  | "none"
  | "speedmath"
  | "tictactoe"
  | "hanoi"
  | "codebreaker"
  | "connect4"
  | "maze"
  | "puzzle15"
  | "nqueens"
  | "cryptarithmetic";

export const AiGamesModule: React.FC<Props> = ({ player, onGainXp }) => {
  const [activeCategory, setActiveCategory] = useState<Category>("basic");
  const [activeGame, setActiveGame] = useState<ActiveGame>("none");

  // Speed Math State
  const [mathNum1, setMathNum1] = useState<number>(7);
  const [mathNum2, setMathNum2] = useState<number>(8);
  const [mathAns, setMathAns] = useState<string>("");
  const [mathMsg, setMathMsg] = useState<string | null>(null);

  // Tic Tac Toe State
  const [tttBoard, setTttBoard] = useState<string[]>(Array(9).fill(""));
  const [tttWinner, setTttWinner] = useState<string | null>(null);

  // Tower of Hanoi State (3 pegs, disks on peg 0)
  const [hanoiPegs, setHanoiPegs] = useState<number[][]>([[3, 2, 1], [], []]);
  const [selectedPeg, setSelectedPeg] = useState<number | null>(null);
  const [hanoiMsg, setHanoiMsg] = useState<string | null>(null);

  // Connect Four State (6 rows x 7 cols)
  const [c4Board, setC4Board] = useState<number[][]>(
    Array(6).fill(null).map(() => Array(7).fill(0))
  );
  const [c4Turn, setC4Turn] = useState<number>(1); // 1 = Human, 2 = AI
  const [c4Winner, setC4Winner] = useState<string | null>(null);

  // A* Maze Pathfinder State (8x8)
  const [mazeGrid, setMazeGrid] = useState<number[][]>(
    Array(8).fill(null).map(() => Array(8).fill(0))
  );
  const [mazeStart] = useState<[number, number]>([0, 0]);
  const [mazeGoal] = useState<[number, number]>([7, 7]);
  const [mazePath, setMazePath] = useState<[number, number][]>([]);

  // N-Queens State (4x4 or 8x8)
  const [nQueensSize, setNQueensSize] = useState<number>(4);
  const [queensBoard, setQueensBoard] = useState<number[]>(Array(4).fill(-1));

  // Cryptarithmetic State
  const [cryptoInputs, setCryptoInputs] = useState<{ [key: string]: string }>({
    S: "9",
    E: "5",
    N: "6",
    D: "7",
    M: "1",
    O: "0",
    R: "8",
    Y: "2",
  });
  const [cryptoStatus, setCryptoStatus] = useState<string | null>(null);

  // 15-Puzzle
  const [puzzleTiles, setPuzzleTiles] = useState<number[]>([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15
  ]);

  // Speed Math Submit
  const handleMathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parseInt(mathAns) === mathNum1 + mathNum2) {
      setMathMsg("🎉 Correct! Hero Empowered (+20 XP)");
      onGainXp(20);
      setMathNum1(Math.floor(Math.random() * 15) + 3);
      setMathNum2(Math.floor(Math.random() * 15) + 3);
      setMathAns("");
    } else {
      setMathMsg("❌ Try again.");
    }
  };

  // Tic-Tac-Toe Move
  const handleTttClick = (idx: number) => {
    if (tttBoard[idx] || tttWinner) return;
    const next = [...tttBoard];
    next[idx] = "X";

    if (checkTttWin(next, "X")) {
      setTttBoard(next);
      setTttWinner("🎉 You Won! (+20 XP)");
      onGainXp(20);
      return;
    }

    // Simple Bot Move
    const emptyIndices = next.map((v, i) => (v === "" ? i : null)).filter((v) => v !== null) as number[];
    if (emptyIndices.length > 0) {
      const botPick = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
      next[botPick] = "O";
      if (checkTttWin(next, "O")) {
        setTttWinner("🤖 Bot Won! Try again.");
      }
    } else {
      setTttWinner("🤝 Draw Game!");
    }
    setTttBoard(next);
  };

  const checkTttWin = (b: string[], p: string) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    return lines.some(([x, y, z]) => b[x] === p && b[y] === p && b[z] === p);
  };

  // Tower of Hanoi Move
  const handlePegClick = (pegIdx: number) => {
    if (selectedPeg === null) {
      if (hanoiPegs[pegIdx].length > 0) {
        setSelectedPeg(pegIdx);
      }
    } else {
      if (selectedPeg === pegIdx) {
        setSelectedPeg(null);
        return;
      }
      const sourcePeg = [...hanoiPegs[selectedPeg]];
      const targetPeg = [...hanoiPegs[pegIdx]];
      const diskToMove = sourcePeg[sourcePeg.length - 1];

      if (targetPeg.length === 0 || targetPeg[targetPeg.length - 1] > diskToMove) {
        sourcePeg.pop();
        targetPeg.push(diskToMove);
        const newPegs = [...hanoiPegs];
        newPegs[selectedPeg] = sourcePeg;
        newPegs[pegIdx] = targetPeg;
        setHanoiPegs(newPegs);

        if (newPegs[2].length === 3) {
          setHanoiMsg("🎉 Tower Solved! (+25 XP)");
          onGainXp(25);
        }
      }
      setSelectedPeg(null);
    }
  };

  // Connect Four
  const dropC4Disc = (col: number) => {
    if (c4Winner || c4Turn !== 1) return;
    let row = -1;
    for (let r = 5; r >= 0; r--) {
      if (c4Board[r][col] === 0) {
        row = r;
        break;
      }
    }
    if (row === -1) return;

    const newBoard = c4Board.map((r) => [...r]);
    newBoard[row][col] = 1;
    setC4Board(newBoard);

    if (checkC4Win(newBoard, 1)) {
      setC4Winner("🎉 You won! Minimax Defeated! (+30 XP)");
      onGainXp(30);
      return;
    }

    setC4Turn(2);
    setTimeout(() => makeAiMinimaxMove(newBoard), 300);
  };

  const makeAiMinimaxMove = (board: number[][]) => {
    const validCols = [];
    for (let c = 0; c < 7; c++) if (board[0][c] === 0) validCols.push(c);
    if (validCols.length === 0) return;

    let bestCol = validCols[Math.floor(validCols.length / 2)];
    let targetRow = 5;
    while (targetRow >= 0 && board[targetRow][bestCol] !== 0) targetRow--;
    if (targetRow >= 0) {
      const newBoard = board.map((r) => [...r]);
      newBoard[targetRow][bestCol] = 2;
      setC4Board(newBoard);
      if (checkC4Win(newBoard, 2)) {
        setC4Winner("🤖 AI Won! Try again.");
      } else {
        setC4Turn(1);
      }
    }
  };

  const checkC4Win = (b: number[][], p: number) => {
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 4; c++)
        if (b[r][c] === p && b[r][c + 1] === p && b[r][c + 2] === p && b[r][c + 3] === p)
          return true;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 7; c++)
        if (b[r][c] === p && b[r + 1][c] === p && b[r + 2][c] === p && b[r + 3][c] === p)
          return true;
    return false;
  };

  // A* Maze Pathfinder
  const runAStarSearch = () => {
    const openSet: [number, number][] = [mazeStart];
    const cameFrom = new Map<string, [number, number]>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    const key = (pos: [number, number]) => `${pos[0]},${pos[1]}`;
    const manhattan = (pos: [number, number]) =>
      Math.abs(pos[0] - mazeGoal[0]) + Math.abs(pos[1] - mazeGoal[1]);

    gScore.set(key(mazeStart), 0);
    fScore.set(key(mazeStart), manhattan(mazeStart));

    while (openSet.length > 0) {
      openSet.sort((a, b) => (fScore.get(key(a)) ?? 999) - (fScore.get(key(b)) ?? 999));
      const current = openSet.shift()!;

      if (current[0] === mazeGoal[0] && current[1] === mazeGoal[1]) {
        const path: [number, number][] = [];
        let temp: [number, number] | undefined = current;
        while (temp) {
          path.unshift(temp);
          temp = cameFrom.get(key(temp));
        }
        setMazePath(path);
        onGainXp(25);
        return;
      }

      const neighbors: [number, number][] = [
        [current[0] + 1, current[1]],
        [current[0] - 1, current[1]],
        [current[0], current[1] + 1],
        [current[0], current[1] - 1],
      ].filter(
        ([r, c]) => r >= 0 && r < 8 && c >= 0 && c < 8 && mazeGrid[r][c] !== 1
      ) as [number, number][];

      for (const neighbor of neighbors) {
        const tentativeG = (gScore.get(key(current)) ?? 999) + 1;
        if (tentativeG < (gScore.get(key(neighbor)) ?? 999)) {
          cameFrom.set(key(neighbor), current);
          gScore.set(key(neighbor), tentativeG);
          fScore.set(key(neighbor), tentativeG + manhattan(neighbor));
          if (!openSet.some((p) => p[0] === neighbor[0] && p[1] === neighbor[1])) {
            openSet.push(neighbor);
          }
        }
      }
    }
  };

  const toggleMazeWall = (r: number, c: number) => {
    if ((r === 0 && c === 0) || (r === 7 && c === 7)) return;
    const newGrid = mazeGrid.map((row) => [...row]);
    newGrid[r][c] = newGrid[r][c] === 1 ? 0 : 1;
    setMazeGrid(newGrid);
    setMazePath([]);
  };

  // Cryptarithmetic CSP
  const evaluateCryptarithmetic = () => {
    const S = parseInt(cryptoInputs.S || "0");
    const E = parseInt(cryptoInputs.E || "0");
    const N = parseInt(cryptoInputs.N || "0");
    const D = parseInt(cryptoInputs.D || "0");
    const M = parseInt(cryptoInputs.M || "0");
    const O = parseInt(cryptoInputs.O || "0");
    const R = parseInt(cryptoInputs.R || "0");
    const Y = parseInt(cryptoInputs.Y || "0");

    const send = S * 1000 + E * 100 + N * 10 + D;
    const more = M * 1000 + O * 100 + R * 10 + E;
    const money = M * 10000 + O * 1000 + N * 100 + E * 10 + Y;

    if (send + more === money && S !== 0 && M !== 0) {
      setCryptoStatus(`🎉 Perfect CSP Solution! ${send} + ${more} = ${money} (+30 XP)`);
      onGainXp(30);
    } else {
      setCryptoStatus(`❌ ${send} + ${more} = ${send + more} ≠ ${money}. Adjust digits!`);
    }
  };

  // N-Queens Backtracking
  const solveNQueensCSP = () => {
    const n = nQueensSize;
    const board = Array(n).fill(-1);

    const isSafe = (b: number[], row: number, col: number) => {
      for (let i = 0; i < row; i++) {
        if (b[i] === col || Math.abs(b[i] - col) === Math.abs(i - row)) return false;
      }
      return true;
    };

    const solve = (row: number): boolean => {
      if (row === n) return true;
      for (let col = 0; col < n; col++) {
        if (isSafe(board, row, col)) {
          board[row] = col;
          if (solve(row + 1)) return true;
          board[row] = -1;
        }
      }
      return false;
    };

    if (solve(0)) {
      setQueensBoard([...board]);
      onGainXp(25);
    }
  };

  return (
    <section className="space-y-3">
      {/* Category Tabs Header */}
      <div>
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <span>🎮</span> Logical & AI Games Hub
        </h2>
        <p className="text-[11px] text-slate-400">
          From basic brain teasers to advanced AI algorithms
        </p>
      </div>

      {/* Mode Selector Navigation */}
      <div className="grid grid-cols-4 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[10px]">
        <button
          onClick={() => {
            setActiveCategory("basic");
            setActiveGame("none");
          }}
          className={`py-1.5 font-bold rounded-lg transition-all ${
            activeCategory === "basic"
              ? "bg-emerald-500 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          ⚡ Basic
        </button>
        <button
          onClick={() => {
            setActiveCategory("moderate");
            setActiveGame("none");
          }}
          className={`py-1.5 font-bold rounded-lg transition-all ${
            activeCategory === "moderate"
              ? "bg-emerald-500 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🧠 Moderate
        </button>
        <button
          onClick={() => {
            setActiveCategory("adversarial");
            setActiveGame("none");
          }}
          className={`py-1.5 font-bold rounded-lg transition-all ${
            activeCategory === "adversarial"
              ? "bg-emerald-500 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          👥 Minimax AI
        </button>
        <button
          onClick={() => {
            setActiveCategory("csp");
            setActiveGame("none");
          }}
          className={`py-1.5 font-bold rounded-lg transition-all ${
            activeCategory === "csp"
              ? "bg-emerald-500 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📐 A* & CSP
        </button>
      </div>

      {/* Category Game Lists */}
      {activeGame === "none" ? (
        <div className="space-y-2">
          {activeCategory === "basic" && (
            <>
              <button
                onClick={() => setActiveGame("speedmath")}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-emerald-500/50 glass-card space-y-1 group cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                    ⚡ Speed Math Revival
                  </span>
                  <span className="text-[10px] font-bold text-amber-400">Resurrect +20 XP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Solve rapid addition equations to sharpen focus and restore hero HP!
                </p>
              </button>

              <button
                onClick={() => setActiveGame("tictactoe")}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-emerald-500/50 glass-card space-y-1 group cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                    ❌⭕ Tic-Tac-Toe Quick Match
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">+20 XP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Classic 3x3 strategy game against a casual bot opponent.
                </p>
              </button>
            </>
          )}

          {activeCategory === "moderate" && (
            <>
              <button
                onClick={() => setActiveGame("hanoi")}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-emerald-500/50 glass-card space-y-1 group cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                    ⛩️ Tower of Hanoi (3-Disk Puzzle)
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">+25 XP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Transfer all disks from Peg 1 to Peg 3 without placing a larger disk on a smaller one.
                </p>
              </button>

              <button
                onClick={() => setActiveGame("puzzle15")}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-emerald-500/50 glass-card space-y-1 group cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                    🧩 15-Puzzle Sliding Tiles
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">+20 XP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Arrange numbered tiles in numerical sequence from 1 to 15.
                </p>
              </button>
            </>
          )}

          {activeCategory === "adversarial" && (
            <>
              <button
                onClick={() => setActiveGame("connect4")}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-emerald-500/50 glass-card space-y-1 group cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                    🔴 Connect Four vs AI (Minimax & Alpha-Beta)
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">+30 XP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Battle an AI agent using Minimax look-ahead depth and heuristic evaluation.
                </p>
              </button>
            </>
          )}

          {activeCategory === "csp" && (
            <>
              <button
                onClick={() => setActiveGame("maze")}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-emerald-500/50 glass-card space-y-1 group cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                    🚩 A* Pathfinder & Maze Navigation
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">+25 XP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Place obstacles and watch A* Search find the optimal path with Manhattan Distance h(n).
                </p>
              </button>

              <button
                onClick={() => setActiveGame("cryptarithmetic")}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-emerald-500/50 glass-card space-y-1 group cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                    🔤 Cryptarithmetic CSP: SEND + MORE = MONEY
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">+30 XP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Assign unique digits to letters satisfying strict CSP arithmetic constraints.
                </p>
              </button>

              <button
                onClick={() => setActiveGame("nqueens")}
                className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/70 hover:border-emerald-500/50 glass-card space-y-1 group cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                    👑 N-Queens Backtracking Solver
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400">+25 XP</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Place N non-attacking Queens using Forward Checking & Most Constrained Variable.
                </p>
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
            <button
              onClick={() => setActiveGame("none")}
              className="text-xs font-bold text-emerald-400 hover:underline cursor-pointer"
            >
              ← Back to Games Menu
            </button>
            <span className="text-[10px] font-mono text-slate-400 uppercase">
              {activeGame} Engine
            </span>
          </div>

          {/* Speed Math UI */}
          {activeGame === "speedmath" && (
            <form onSubmit={handleMathSubmit} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 glass-card space-y-3">
              <div className="flex items-center justify-center gap-2 py-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xl font-bold">
                <span className="text-emerald-400">{mathNum1}</span>
                <span className="text-slate-400">+</span>
                <span className="text-purple-400">{mathNum2}</span>
                <span className="text-slate-400">=</span>
                <input
                  type="number"
                  value={mathAns}
                  onChange={(e) => setMathAns(e.target.value)}
                  className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-center text-emerald-300 text-lg font-bold focus:outline-none focus:border-emerald-500"
                  autoFocus
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 cursor-pointer"
              >
                Submit Answer
              </button>
              {mathMsg && <div className="text-xs font-bold text-center text-emerald-400">{mathMsg}</div>}
            </form>
          )}

          {/* Tic Tac Toe UI */}
          {activeGame === "tictactoe" && (
            <div className="space-y-3 text-center">
              <div className="text-xs font-bold text-slate-200">You (X) vs Bot (O)</div>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-2 rounded-xl border border-slate-800 w-44 mx-auto">
                {tttBoard.map((cell, i) => (
                  <button
                    key={i}
                    onClick={() => handleTttClick(i)}
                    className="h-12 rounded-lg text-lg font-extrabold flex items-center justify-center bg-slate-950 border border-slate-800 text-emerald-400 hover:border-emerald-500 cursor-pointer"
                  >
                    {cell}
                  </button>
                ))}
              </div>
              {tttWinner && <div className="text-xs font-bold text-emerald-400 p-2 bg-slate-900 rounded-lg">{tttWinner}</div>}
              <button
                onClick={() => {
                  setTttBoard(Array(9).fill(""));
                  setTttWinner(null);
                }}
                className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-800 text-slate-300"
              >
                Reset Board
              </button>
            </div>
          )}

          {/* Tower of Hanoi UI */}
          {activeGame === "hanoi" && (
            <div className="space-y-3 text-center">
              <div className="text-xs font-bold text-slate-200">
                Move all disks to Peg 3 (Click peg to select, click target to drop)
              </div>
              <div className="grid grid-cols-3 gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800 min-h-[120px]">
                {hanoiPegs.map((peg, pIdx) => (
                  <button
                    key={pIdx}
                    onClick={() => handlePegClick(pIdx)}
                    className={`flex flex-col-reverse items-center justify-start p-2 rounded-lg border transition-all cursor-pointer ${
                      selectedPeg === pIdx
                        ? "border-emerald-500 bg-emerald-950/40"
                        : "border-slate-800 bg-slate-950 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-400 mt-1">Peg {pIdx + 1}</div>
                    {peg.map((dSize, dIdx) => (
                      <div
                        key={dIdx}
                        style={{ width: `${dSize * 24}%` }}
                        className="h-4 my-0.5 rounded bg-gradient-to-r from-emerald-500 to-teal-400 border border-emerald-300 text-[9px] font-bold text-slate-950 flex items-center justify-center"
                      >
                        {dSize}
                      </div>
                    ))}
                  </button>
                ))}
              </div>
              {hanoiMsg && <div className="text-xs font-bold text-emerald-400 p-2 bg-slate-900 rounded-lg">{hanoiMsg}</div>}
              <button
                onClick={() => {
                  setHanoiPegs([[3, 2, 1], [], []]);
                  setSelectedPeg(null);
                  setHanoiMsg(null);
                }}
                className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-800 text-slate-300"
              >
                Reset Puzzle
              </button>
            </div>
          )}

          {/* Connect Four UI */}
          {activeGame === "connect4" && (
            <div className="space-y-3 text-center">
              <div className="text-xs font-bold text-slate-200">
                Minimax AI Connect Four (You: 🔴 | AI: 🟡)
              </div>
              <div className="grid grid-cols-7 gap-1 bg-slate-900 p-2 rounded-xl border border-slate-800 w-64 mx-auto">
                {c4Board.map((row, r) =>
                  row.map((cell, c) => (
                    <button
                      key={`${r}-${c}`}
                      onClick={() => dropC4Disc(c)}
                      className={`w-7 h-7 rounded-full flex items-center justify-center border ${
                        cell === 1
                          ? "bg-rose-500 border-rose-400"
                          : cell === 2
                          ? "bg-amber-400 border-amber-300"
                          : "bg-slate-950 border-slate-800 hover:border-slate-600 cursor-pointer"
                      }`}
                    />
                  ))
                )}
              </div>
              {c4Winner && <div className="text-xs font-bold text-emerald-400 p-2 bg-slate-900 rounded-lg">{c4Winner}</div>}
              <button
                onClick={() => {
                  setC4Board(Array(6).fill(null).map(() => Array(7).fill(0)));
                  setC4Winner(null);
                  setC4Turn(1);
                }}
                className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Reset Match
              </button>
            </div>
          )}

          {/* A* Maze UI */}
          {activeGame === "maze" && (
            <div className="space-y-3 text-center">
              <div className="text-xs font-bold text-slate-200">
                Click grid to place Walls █. Start 🟢 (0,0) → Goal 🚩 (7,7)
              </div>
              <div className="grid grid-cols-8 gap-1 bg-slate-900 p-2 rounded-xl border border-slate-800 w-64 mx-auto">
                {mazeGrid.map((row, r) =>
                  row.map((cell, c) => {
                    const isStart = r === 0 && c === 0;
                    const isGoal = r === 7 && c === 7;
                    const isPath = mazePath.some(([pr, pc]) => pr === r && pc === c);
                    return (
                      <button
                        key={`${r}-${c}`}
                        onClick={() => toggleMazeWall(r, c)}
                        className={`w-6 h-6 rounded text-[9px] font-bold flex items-center justify-center border transition-all ${
                          isStart
                            ? "bg-emerald-500 text-slate-950"
                            : isGoal
                            ? "bg-rose-500 text-white"
                            : isPath
                            ? "bg-cyan-400 text-slate-950 glow-cyan"
                            : cell === 1
                            ? "bg-slate-950 border-slate-800 text-slate-600"
                            : "bg-slate-900 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {isStart ? "S" : isGoal ? "G" : cell === 1 ? "█" : ""}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={runAStarSearch}
                  className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 cursor-pointer"
                >
                  Run A* Search ➔
                </button>
                <button
                  onClick={() => {
                    setMazeGrid(Array(8).fill(null).map(() => Array(8).fill(0)));
                    setMazePath([]);
                  }}
                  className="px-3 py-1 text-xs font-bold rounded-lg bg-slate-800 text-slate-300"
                >
                  Clear Walls
                </button>
              </div>
            </div>
          )}

          {/* Cryptarithmetic UI */}
          {activeGame === "cryptarithmetic" && (
            <div className="space-y-3 text-center">
              <div className="text-xs font-bold text-slate-200">
                SEND + MORE = MONEY (Assign 0-9 digits)
              </div>
              <div className="grid grid-cols-4 gap-2 bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs">
                {Object.keys(cryptoInputs).map((letter) => (
                  <div key={letter} className="flex flex-col items-center">
                    <label className="text-[10px] font-bold text-emerald-400">{letter}:</label>
                    <input
                      type="number"
                      min="0"
                      max="9"
                      value={cryptoInputs[letter]}
                      onChange={(e) =>
                        setCryptoInputs({ ...cryptoInputs, [letter]: e.target.value })
                      }
                      className="w-10 px-1 py-1 text-center bg-slate-950 border border-slate-700 rounded text-emerald-300 font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={evaluateCryptarithmetic}
                className="w-full py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 cursor-pointer"
              >
                Validate CSP Constraints
              </button>
              {cryptoStatus && (
                <div className="text-xs font-bold p-2 rounded-lg bg-slate-900 text-slate-200">
                  {cryptoStatus}
                </div>
              )}
            </div>
          )}

          {/* N-Queens UI */}
          {activeGame === "nqueens" && (
            <div className="space-y-3 text-center">
              <div className="text-xs font-bold text-slate-200">
                {nQueensSize}-Queens Backtracking Solver
              </div>
              <div className="flex justify-center gap-2 text-xs">
                <button
                  onClick={() => {
                    setNQueensSize(4);
                    setQueensBoard(Array(4).fill(-1));
                  }}
                  className={`px-2 py-0.5 rounded font-bold ${
                    nQueensSize === 4 ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300"
                  }`}
                >
                  4 Queens
                </button>
                <button
                  onClick={() => {
                    setNQueensSize(8);
                    setQueensBoard(Array(8).fill(-1));
                  }}
                  className={`px-2 py-0.5 rounded font-bold ${
                    nQueensSize === 8 ? "bg-emerald-500 text-slate-950" : "bg-slate-800 text-slate-300"
                  }`}
                >
                  8 Queens
                </button>
              </div>

              <div
                className={`grid gap-1 bg-slate-900 p-2 rounded-xl border border-slate-800 mx-auto ${
                  nQueensSize === 4 ? "grid-cols-4 w-44" : "grid-cols-8 w-64"
                }`}
              >
                {Array(nQueensSize)
                  .fill(null)
                  .map((_, r) =>
                    Array(nQueensSize)
                      .fill(null)
                      .map((_, c) => {
                        const hasQueen = queensBoard[r] === c;
                        return (
                          <div
                            key={`${r}-${c}`}
                            className={`h-8 rounded flex items-center justify-center border font-bold text-sm ${
                              hasQueen
                                ? "bg-amber-400 border-amber-300 text-slate-950 glow-amber"
                                : (r + c) % 2 === 0
                                ? "bg-slate-950 border-slate-800"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            {hasQueen ? "👑" : ""}
                          </div>
                        );
                      })
                  )}
              </div>

              <button
                onClick={solveNQueensCSP}
                className="w-full py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 cursor-pointer"
              >
                Run CSP Backtracking Solver
              </button>
            </div>
          )}

          {/* 15-Puzzle UI */}
          {activeGame === "puzzle15" && (
            <div className="space-y-3 text-center">
              <div className="text-xs font-bold text-slate-200">
                15-Puzzle Sliding Tiles
              </div>
              <div className="grid grid-cols-4 gap-1.5 bg-slate-900 p-2 rounded-xl border border-slate-800 w-56 mx-auto">
                {puzzleTiles.map((tile, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const blank = puzzleTiles.indexOf(0);
                      if (
                        [blank - 1, blank + 1, blank - 4, blank + 4].includes(i)
                      ) {
                        const next = [...puzzleTiles];
                        next[blank] = tile;
                        next[i] = 0;
                        setPuzzleTiles(next);
                        if (
                          next.join(",") ===
                          "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0"
                        ) {
                          onGainXp(30);
                        }
                      }
                    }}
                    className={`h-11 rounded-lg text-sm font-bold flex items-center justify-center border transition-all ${
                      tile === 0
                        ? "bg-slate-950 border-slate-900 cursor-default"
                        : "bg-slate-900 border-slate-700 text-emerald-300 hover:border-emerald-500 cursor-pointer"
                    }`}
                  >
                    {tile !== 0 ? tile : ""}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
