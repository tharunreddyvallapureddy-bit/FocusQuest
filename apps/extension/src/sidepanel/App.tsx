import React, { useEffect, useState } from "react";

type Tab = "stats" | "goals" | "training" | "bounties";

type Goal = {
  id: string;
  title: string;
  description?: string;
  goalType: "daily" | "weekly";
  isCompleted: boolean;
};

type PlayerState = {
  hp: number;
  maxHp: number;
  coins: number;
  level: number;
  intellectXp: number;
  isDead: boolean;
};

const DEFAULT_PLAYER: PlayerState = {
  hp: 100,
  maxHp: 100,
  coins: 50,
  level: 1,
  intellectXp: 0,
  isDead: false,
};

const DEFAULT_GOALS: Goal[] = [
  {
    id: "react-2h",
    title: "Deep Work: React & TypeScript",
    description: "Build or study focused for 120 minutes.",
    goalType: "daily",
    isCompleted: false,
  },
  {
    id: "algo-30m",
    title: "Algorithm Mastery: Solve 3 Problems",
    description: "Practice on LeetCode, HackerRank or Codeforces.",
    goalType: "daily",
    isCompleted: false,
  },
  {
    id: "clean-code-weekly",
    title: "Weekly Quest: Ship a Full Feature",
    description: "Complete a full module refactor or new feature.",
    goalType: "weekly",
    isCompleted: false,
  },
];

function getAvatarUrl(player: PlayerState) {
  const status =
    player.hp <= 0 ? "injured" : player.hp < 30 ? "injured" : "healthy";
  return `https://image.pollinations.ai/prompt/pixel_art_warrior_level_${player.level}_${status}`;
}

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("stats");
  const [player, setPlayer] = useState<PlayerState>(DEFAULT_PLAYER);
  const [goals, setGoals] = useState<Goal[]>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bounties, setBounties] = useState<any[]>([]);
  const [bountiesLoading, setBountiesLoading] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [newGoalType, setNewGoalType] = useState<"daily" | "weekly">("daily");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Load data from local storage on mount
  useEffect(() => {
    loadFromLocalStorage();

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return;
      if (changes.playerState?.newValue) {
        setPlayer(changes.playerState.newValue as PlayerState);
      }
      if (changes.goals?.newValue) {
        setGoals(changes.goals.newValue as Goal[]);
      }
    };

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.onChanged.addListener(listener);
    }

    return () => {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.onChanged.removeListener(listener);
      }
    };
  }, []);

  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const loadFromLocalStorage = async () => {
    if (typeof chrome === "undefined" || !chrome.storage) {
      setLoading(false);
      return;
    }

    chrome.storage.local.get(
      ["playerState", "goals", "bountiesCache", "bountiesFetchedAt"],
      (result) => {
        const storedPlayer = result.playerState as PlayerState | undefined;
        const storedGoals = result.goals as Goal[] | undefined;

        setPlayer(storedPlayer ?? DEFAULT_PLAYER);
        setGoals(storedGoals ?? DEFAULT_GOALS);

        const cache = result.bountiesCache as any[] | undefined;
        const fetchedAt = result.bountiesFetchedAt as string | undefined;
        if (cache && fetchedAt) {
          setBounties(cache);
        }
        setLoading(false);
      }
    );
  };

  const persistPlayer = async (next: PlayerState) => {
    setPlayer(next);
    if (typeof chrome === "undefined" || !chrome.storage) return;
    setSaving(true);
    chrome.storage.local.set({ playerState: next }, () => setSaving(false));
  };

  const persistGoals = (next: Goal[]) => {
    setGoals(next);
    if (typeof chrome === "undefined" || !chrome.storage) return;
    chrome.storage.local.set({ goals: next });
  };

  const handleToggleGoal = async (goal: Goal) => {
    if (goal.isCompleted) return;

    const updatedGoals = goals.map((g) =>
      g.id === goal.id ? { ...g, isCompleted: true } : g
    );
    persistGoals(updatedGoals);

    const rewardHp = 25;
    const rewardCoins = 50;
    const rewardXp = 20;

    const newXp = player.intellectXp + rewardXp;
    const newLevel = Math.floor(newXp / 100) + 1;

    const next: PlayerState = {
      ...player,
      hp: Math.min(player.hp + rewardHp, player.maxHp),
      coins: player.coins + rewardCoins,
      intellectXp: newXp,
      level: newLevel,
      isDead: false,
    };
    await persistPlayer(next);
    triggerToast(`🎉 Quest Complete! +${rewardCoins} Coins, +${rewardHp} HP, +${rewardXp} INT XP`);
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;

    const newGoal: Goal = {
      id: `goal-${Date.now()}`,
      title: newGoalTitle.trim(),
      description: newGoalDesc.trim() || undefined,
      goalType: newGoalType,
      isCompleted: false,
    };

    const updated = [newGoal, ...goals];
    persistGoals(updated);
    setNewGoalTitle("");
    setNewGoalDesc("");
    setShowAddGoal(false);
    triggerToast("✨ New Quest Added!");
  };

  const handleGiveTrainingXp = async (amount: number) => {
    const newXp = player.intellectXp + amount;
    const newLevel = Math.floor(newXp / 100) + 1;
    const wasDead = player.isDead;
    const newHp = wasDead ? 30 : player.hp;

    const next: PlayerState = {
      ...player,
      intellectXp: newXp,
      level: newLevel,
      hp: newHp,
      isDead: false,
    };
    await persistPlayer(next);
    if (wasDead) {
      triggerToast("✨ Hero Revived! HP restored to 30.");
    } else {
      triggerToast(`🧠 Intellect Boost! +${amount} INT XP`);
    }
  };

  const loadBounties = async () => {
    if (bountiesLoading) return;
    setBountiesLoading(true);

    try {
      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.get(
          ["bountiesCache", "bountiesFetchedAt"],
          async (result) => {
            const fetchedAt = result.bountiesFetchedAt as string | undefined;
            const cache = result.bountiesCache as any[] | undefined;

            const now = Date.now();
            const hourMs = 60 * 60 * 1000;
            if (cache && fetchedAt && now - Date.parse(fetchedAt) < hourMs) {
              setBounties(cache);
              setBountiesLoading(false);
              return;
            }

            const res = await fetch(
              "https://api.github.com/search/issues?q=label:good-first-issue+language:javascript&per_page=6"
            );
            const data = await res.json();
            const items = Array.isArray(data.items) ? data.items : [];
            setBounties(items);

            chrome.storage.local.set({
              bountiesCache: items,
              bountiesFetchedAt: new Date().toISOString(),
            });
            setBountiesLoading(false);
          }
        );
      } else {
        const res = await fetch(
          "https://api.github.com/search/issues?q=label:good-first-issue+language:javascript&per_page=6"
        );
        const data = await res.json();
        setBounties(Array.isArray(data.items) ? data.items : []);
        setBountiesLoading(false);
      }
    } catch (e) {
      console.error("Failed to load bounties", e);
      setBountiesLoading(false);
    }
  };

  const handleViewIssue = (url: string) => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank");
    }
    handleGiveTrainingXp(5);
  };

  const avatarUrl = getAvatarUrl(player);
  const hpPercent = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
  const xpInLevel = player.intellectXp % 100;

  return (
    <div className="w-[380px] h-[580px] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden relative border border-slate-800/80 shadow-2xl">
      {/* Toast Notification */}
      {notification && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-emerald-500/90 text-slate-950 font-semibold text-xs shadow-lg backdrop-blur-md animate-bounce">
          {notification}
        </div>
      )}

      {/* Cyber Hero HUD Header */}
      <header className="px-4 py-3.5 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800/80 relative">
        <div className="flex items-center gap-3">
          {/* Avatar Ring */}
          <div className="relative">
            <div
              className={`w-14 h-14 rounded-xl p-0.5 transition-all duration-300 ${
                player.isDead
                  ? "bg-gradient-to-br from-rose-600 to-red-900 glow-rose"
                  : player.hp < 30
                  ? "bg-gradient-to-br from-amber-500 to-orange-700 glow-amber"
                  : "bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 glow-emerald animate-pulse-subtle"
              }`}
            >
              <img
                src={avatarUrl}
                alt="Hero Avatar"
                className="w-full h-full rounded-[10px] object-cover bg-slate-900"
              />
            </div>
            <span
              className={`absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border border-slate-800 ${
                player.isDead
                  ? "bg-rose-900 text-rose-200"
                  : player.hp < 30
                  ? "bg-amber-900 text-amber-200"
                  : "bg-emerald-950 text-emerald-300"
              }`}
            >
              Lvl {player.level}
            </span>
          </div>

          {/* Hero Vitals */}
          <div className="flex-1 space-y-1.5">
            <div className="flex justify-between items-center">
              <h1 className="text-base font-extrabold tracking-tight text-gradient-emerald">
                Focus Quest
              </h1>
              <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-0.5 rounded-full border border-amber-500/30">
                <span className="text-xs">🪙</span>
                <span className="text-xs font-bold text-amber-400">
                  {player.coins}
                </span>
              </div>
            </div>

            {/* Health Bar */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[11px] font-medium text-slate-300">
                <span className="flex items-center gap-1">
                  <span className={player.isDead ? "text-rose-400" : "text-emerald-400"}>
                    {player.isDead ? "💀 DEAD" : "❤️ HP"}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {player.hp} / {player.maxHp}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800 p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    player.isDead
                      ? "bg-rose-600"
                      : player.hp < 30
                      ? "bg-amber-500"
                      : "bg-gradient-to-r from-emerald-500 to-teal-400"
                  }`}
                  style={{ width: `${hpPercent}%` }}
                />
              </div>
            </div>

            {/* Intellect XP Bar */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[10px] font-medium text-slate-400">
                <span>🧠 Intellect XP</span>
                <span className="font-mono text-[10px] text-purple-400">
                  {xpInLevel} / 100 XP
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500"
                  style={{ width: `${xpInLevel}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Cyber Tab Bar Navigation */}
      <nav className="flex bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md">
        {(
          [
            { id: "stats", label: "Stats", icon: "📊" },
            { id: "goals", label: "Quests", icon: "📜" },
            { id: "training", label: "Training", icon: "⚔️" },
            { id: "bounties", label: "Bounties", icon: "🎯" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-xs font-semibold transition-all relative ${
              tab === t.id
                ? "text-emerald-400 bg-slate-800/50"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
            }`}
          >
            <span className="text-sm">{t.icon}</span>
            <span className="text-[11px]">{t.label}</span>
            {tab === t.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 glow-emerald" />
            )}
          </button>
        ))}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-xs text-slate-400 font-medium">
              Summoning Focus Quest...
            </div>
          </div>
        ) : tab === "stats" ? (
          <section className="space-y-3">
            {/* Status Hero Card */}
            <div
              className={`p-3.5 rounded-xl border glass-card relative overflow-hidden ${
                player.isDead
                  ? "border-rose-500/40 bg-rose-950/20"
                  : player.hp < 30
                  ? "border-amber-500/40 bg-amber-950/20"
                  : "border-emerald-500/30 bg-emerald-950/20"
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                    Hero Condition
                  </div>
                  <div
                    className={`text-lg font-black mt-0.5 ${
                      player.isDead
                        ? "text-rose-400"
                        : player.hp < 30
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {player.isDead
                      ? "💀 DEFEATED (Blocked)"
                      : player.hp < 30
                      ? "⚠️ CRITICAL INJURY"
                      : "⚡ READY FOR QUESTS"}
                  </div>
                </div>
                <div className="text-2xl">
                  {player.isDead ? "🪦" : player.hp < 30 ? "🩹" : "⚔️"}
                </div>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {player.isDead
                  ? "Your HP reached 0 due to distracting websites! Go to Training Grounds and beat Speed Math to revive."
                  : "Productive websites (GitHub, StackOverflow) heal your HP. Distracting sites slowly drain your vital energy!"}
              </p>
            </div>

            {/* Rules Matrix */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-slate-900/60 glass-card">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                  <span>💚</span> Productive Sites
                </div>
                <div className="text-xs text-slate-300 font-medium mt-1">
                  +1 HP / min
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  GitHub, StackOverflow, Canvas
                </div>
              </div>

              <div className="p-3 rounded-xl border border-rose-500/30 bg-slate-900/60 glass-card">
                <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                  <span>🔥</span> Distracting Sites
                </div>
                <div className="text-xs text-slate-300 font-medium mt-1">
                  -5 HP / min
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Instagram, Reddit, TikTok
                </div>
              </div>
            </div>

            {/* Quick Focus Pomodoro Trigger */}
            <FocusPomodoroTimer onComplete={() => handleGiveTrainingXp(20)} />
          </section>
        ) : tab === "goals" ? (
          <section className="space-y-3">
            {/* Quest Header & Add Toggle */}
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <span>📜</span> Active Quests
                </h2>
                <p className="text-[11px] text-slate-400">
                  Complete goals for +50 Coins & +25 HP
                </p>
              </div>
              <button
                onClick={() => setShowAddGoal(!showAddGoal)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-all shadow-md"
              >
                {showAddGoal ? "Cancel" : "+ New Quest"}
              </button>
            </div>

            {/* Add Goal Modal / Form */}
            {showAddGoal && (
              <form
                onSubmit={handleAddGoal}
                className="p-3 rounded-xl border border-emerald-500/40 bg-slate-900/90 space-y-2.5 glass-card"
              >
                <div className="text-xs font-bold text-emerald-400">
                  Create Custom Quest
                </div>
                <input
                  type="text"
                  placeholder="Quest Title (e.g. Study Algorithms)"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Short Description (optional)"
                  value={newGoalDesc}
                  onChange={(e) => setNewGoalDesc(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="goalType"
                      checked={newGoalType === "daily"}
                      onChange={() => setNewGoalType("daily")}
                      className="accent-emerald-500"
                    />
                    <span>Daily Quest</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="goalType"
                      checked={newGoalType === "weekly"}
                      onChange={() => setNewGoalType("weekly")}
                      className="accent-emerald-500"
                    />
                    <span>Weekly Quest</span>
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 hover:opacity-95 transition-all"
                >
                  Confirm Quest
                </button>
              </form>
            )}

            {/* Goals List */}
            <div className="space-y-2">
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  className={`p-3 rounded-xl border transition-all glass-card ${
                    goal.isCompleted
                      ? "border-slate-800/60 bg-slate-950/40 opacity-70"
                      : "border-slate-800 bg-slate-900/70 hover:border-emerald-500/50"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={goal.isCompleted}
                      onChange={() => handleToggleGoal(goal)}
                      className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 accent-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <span
                          className={`text-xs font-bold ${
                            goal.isCompleted
                              ? "line-through text-slate-500"
                              : "text-slate-100"
                          }`}
                        >
                          {goal.title}
                        </span>
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                            goal.goalType === "daily"
                              ? "bg-indigo-950 text-indigo-300 border border-indigo-800/50"
                              : "bg-purple-950 text-purple-300 border border-purple-800/50"
                          }`}
                        >
                          {goal.goalType}
                        </span>
                      </div>
                      {goal.description && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          {goal.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                        <span className="text-emerald-400 font-semibold">
                          +25 HP
                        </span>
                        <span className="text-amber-400 font-semibold">
                          +50 Coins
                        </span>
                        <span className="text-purple-400 font-semibold">
                          +20 INT XP
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : tab === "training" ? (
          <TrainingGrounds onGainXp={handleGiveTrainingXp} />
        ) : (
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <span>🎯</span> GitHub Bounties
                </h2>
                <p className="text-[11px] text-slate-400">
                  Real open-source issues labeled <code>good-first-issue</code>
                </p>
              </div>
              <button
                onClick={loadBounties}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-all shadow-md"
              >
                {bountiesLoading ? "Fetching..." : "Refresh"}
              </button>
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {bounties.map((issue) => (
                <div
                  key={issue.id}
                  className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 glass-card space-y-1.5"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="text-xs font-bold text-slate-100 line-clamp-2 leading-snug">
                      {issue.title}
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50 shrink-0">
                      Open Issue
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-purple-400">
                    📂 {issue.repository_url?.split("/").slice(-2).join("/")}
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                    <span className="text-[10px] text-purple-300 font-semibold">
                      Reward: +5 INT XP
                    </span>
                    <button
                      onClick={() => handleViewIssue(issue.html_url)}
                      className="px-2 py-0.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1"
                    >
                      Inspect Quest ➔
                    </button>
                  </div>
                </div>
              ))}
              {!bountiesLoading && bounties.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500 space-y-2">
                  <div className="text-2xl">🎯</div>
                  <p>No bounties loaded yet.</p>
                  <button
                    onClick={loadBounties}
                    className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 text-slate-950"
                  >
                    Load Quest Board
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

/* Pomodoro Focus Timer Component */
const FocusPomodoroTimer: React.FC<{ onComplete: () => void }> = ({
  onComplete,
}) => {
  const [seconds, setSeconds] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive && seconds > 0) {
      interval = setInterval(() => setSeconds((s) => s - 1), 1000);
    } else if (seconds === 0 && isActive) {
      setIsActive(false);
      onComplete();
      setSeconds(25 * 60);
    }
    return () => clearInterval(interval);
  }, [isActive, seconds, onComplete]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0"
  )}`;

  return (
    <div className="p-3.5 rounded-xl border border-purple-500/30 bg-slate-900/60 glass-card space-y-2">
      <div className="flex justify-between items-center">
        <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
          <span>⏱️</span> Pomodoro Focus Chamber
        </div>
        <span className="text-[10px] text-purple-400 font-mono">+20 INT XP</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-2xl font-black font-mono text-gradient-purple">
          {timeStr}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsActive(!isActive)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-md ${
              isActive
                ? "bg-rose-600 hover:bg-rose-500 text-slate-50"
                : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-slate-50"
            }`}
          >
            {isActive ? "Pause" : "Start Focus"}
          </button>
          <button
            onClick={() => {
              setIsActive(false);
              setSeconds(25 * 60);
            }}
            className="px-2 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-800"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

/* Training Grounds Sub-Component */
type TrainingProps = {
  onGainXp: (amount: number) => void;
};

const TrainingGrounds: React.FC<TrainingProps> = ({ onGainXp }) => {
  const [mode, setMode] = useState<"menu" | "memory" | "speed">("menu");

  if (mode === "menu") {
    return (
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <span>⚔️</span> Training Grounds
          </h2>
          <p className="text-[11px] text-slate-400">
            Train your intellect & resurrect your hero from defeat
          </p>
        </div>

        <div className="space-y-2">
          <button
            className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-emerald-500/50 glass-card space-y-1 transition-all group"
            onClick={() => setMode("memory")}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                🧩 Elemental Memory Match
              </span>
              <span className="text-[10px] font-bold text-emerald-400">
                +15 INT XP
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Flip and match elemental rune pairs to sharpen focus.
            </p>
          </button>

          <button
            className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-emerald-500/50 glass-card space-y-1 transition-all group"
            onClick={() => setMode("speed")}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                ⚡ Speed Math (Redemption Game)
              </span>
              <span className="text-[10px] font-bold text-amber-400">
                Revive + 15 INT XP
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Solve rapid arithmetic equations. Revives hero if defeated!
            </p>
          </button>
        </div>
      </section>
    );
  }

  if (mode === "memory") {
    return (
      <MemoryMatch
        onBack={() => setMode("menu")}
        onWin={() => onGainXp(15)}
      />
    );
  }

  return <SpeedMath onBack={() => setMode("menu")} onWin={() => onGainXp(15)} />;
};

type GameProps = {
  onBack: () => void;
  onWin: () => void;
};

const MemoryMatch: React.FC<GameProps> = ({ onBack, onWin }) => {
  const symbols = ["🔥", "💧", "🌱", "⚡", "🛡️", "🔮"];
  const [cards, setCards] = useState(() =>
    [...symbols, ...symbols]
      .map((s, i) => ({ id: i, symbol: s, matched: false }))
      .sort(() => Math.random() - 0.5)
  );
  const [flipped, setFlipped] = useState<number[]>([]);
  const [lock, setLock] = useState(false);

  useEffect(() => {
    if (cards.length > 0 && cards.every((c) => c.matched)) {
      onWin();
    }
  }, [cards, onWin]);

  const handleFlip = (id: number) => {
    if (lock) return;
    const index = cards.findIndex((c) => c.id === id);
    if (index === -1 || cards[index].matched) return;
    if (flipped.includes(index)) return;

    const nextFlipped = [...flipped, index];
    setFlipped(nextFlipped);

    if (nextFlipped.length === 2) {
      const [a, b] = nextFlipped;
      setLock(true);
      setTimeout(() => {
        setLock(false);
        if (cards[a].symbol === cards[b].symbol) {
          setCards((prev) =>
            prev.map((c, idx) =>
              idx === a || idx === b ? { ...c, matched: true } : c
            )
          );
        }
        setFlipped([]);
      }, 500);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <span>🧩</span> Elemental Memory Match
        </h2>
        <button
          className="text-xs text-emerald-400 font-semibold hover:underline"
          onClick={onBack}
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {cards.map((card, index) => {
          const isFaceUp = card.matched || flipped.includes(index);
          return (
            <button
              key={card.id}
              className={`h-14 rounded-xl text-xl flex items-center justify-center border transition-all duration-300 ${
                card.matched
                  ? "bg-emerald-950/80 border-emerald-500 text-emerald-300 glow-emerald scale-95"
                  : isFaceUp
                  ? "bg-slate-800 border-slate-600 text-slate-100"
                  : "bg-slate-900 border-slate-800 hover:border-emerald-500/50"
              }`}
              onClick={() => handleFlip(card.id)}
            >
              {isFaceUp ? card.symbol : "❓"}
            </button>
          );
        })}
      </div>
    </section>
  );
};

const SpeedMath: React.FC<GameProps> = ({ onBack, onWin }) => {
  const [a, setA] = useState(4);
  const [b, setB] = useState(7);
  const [answer, setAnswer] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const newProblem = () => {
    const na = Math.floor(Math.random() * 15) + 3;
    const nb = Math.floor(Math.random() * 15) + 3;
    setA(na);
    setB(nb);
    setAnswer("");
    setMessage(null);
  };

  useEffect(() => {
    newProblem();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const expected = a + b;
    if (Number(answer) === expected) {
      setMessage("🎉 Correct! Hero Empowered (+15 INT XP)");
      onWin();
      newProblem();
    } else {
      setMessage("❌ Incorrect! Try again.");
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <span>⚡</span> Speed Math Challenge
        </h2>
        <button
          className="text-xs text-emerald-400 font-semibold hover:underline"
          onClick={onBack}
        >
          ← Back
        </button>
      </div>

      <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 glass-card space-y-3">
        <p className="text-xs text-slate-300 leading-relaxed">
          Solve quick math problems to earn Intellect XP. If your hero is
          defeated, solving one will resurrect you to 30 HP!
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-center gap-2 py-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xl font-bold">
            <span className="text-emerald-400">{a}</span>
            <span className="text-slate-400">+</span>
            <span className="text-purple-400">{b}</span>
            <span className="text-slate-400">=</span>
            <input
              type="number"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-center text-emerald-300 text-lg font-bold focus:outline-none focus:border-emerald-500"
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 hover:opacity-95 transition-all shadow-md"
          >
            Submit Answer
          </button>
        </form>

        {message && (
          <div
            className={`text-xs font-bold text-center p-2 rounded-lg ${
              message.includes("Correct")
                ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                : "bg-rose-950 text-rose-300 border border-rose-800"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </section>
  );
};
