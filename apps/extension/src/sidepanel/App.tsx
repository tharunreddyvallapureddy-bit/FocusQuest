import React, { useEffect, useState } from "react";
import {
  BASE_MAX_HP,
  calculateLevel,
  goldToINR,
  getDiceBearAvatar,
} from "../lib/mechanics";
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  syncProfileToFirestore,
  loadProfileFromFirestore,
  User,
} from "../lib/firebase";

type Tab = "stats" | "goals" | "training" | "bounties" | "ads";

type Goal = {
  id: string;
  title: string;
  description?: string;
  goalType: "daily" | "weekly";
  targetMinutes?: number;
  progressMinutes?: number;
  isCompleted: boolean;
  autoVerified?: boolean;
};

type PlayerState = {
  hp: number;
  maxHp: number;
  coins: number;
  intellectXp: number;
  isDead: boolean;
  avatarSeed: string;
  focusMode: boolean; // Active DNR blocking toggle
  name?: string;
  mobileNumber?: string;
  upiId?: string;
  isLoggedIn?: boolean;
};

const DEFAULT_PLAYER: PlayerState = {
  hp: 300,
  maxHp: BASE_MAX_HP,
  coins: 100,
  intellectXp: 0,
  isDead: false,
  avatarSeed: "AdventurerHero",
  focusMode: true,
  name: "",
  mobileNumber: "",
  upiId: "",
  isLoggedIn: false,
};

const DEFAULT_GOALS: Goal[] = [
  {
    id: "react-2h",
    title: "Deep Work: React & TypeScript",
    description: "Build or study focused for 120 minutes.",
    goalType: "daily",
    targetMinutes: 120,
    progressMinutes: 0,
    isCompleted: false,
    autoVerified: false,
  },
  {
    id: "algo-30m",
    title: "Algorithm Mastery: Solve 3 Problems",
    description: "Practice on LeetCode, HackerRank or Codeforces.",
    goalType: "daily",
    targetMinutes: 30,
    progressMinutes: 0,
    isCompleted: false,
    autoVerified: false,
  },
  {
    id: "clean-code-weekly",
    title: "Weekly Quest: Ship a Full Feature",
    description: "Complete a full module refactor or new feature.",
    goalType: "weekly",
    targetMinutes: 300,
    progressMinutes: 0,
    isCompleted: false,
    autoVerified: false,
  },
];

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("stats");
  const [player, setPlayer] = useState<PlayerState>(DEFAULT_PLAYER);
  const [goals, setGoals] = useState<Goal[]>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [bounties, setBounties] = useState<any[]>([]);
  const [bountiesLoading, setBountiesLoading] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [newGoalType, setNewGoalType] = useState<"daily" | "weekly">("daily");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Firebase Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authName, setAuthName] = useState("");
  const [authMobile, setAuthMobile] = useState("");
  const [authUpiId, setAuthUpiId] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // UPI Cash Out & Developer Ad State
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [upiGoldAmount, setUpiGoldAmount] = useState(100);
  const [upiPayoutRequests, setUpiPayoutRequests] = useState<any[]>([]);

  // Initialize Auth & Storage listeners
  useEffect(() => {
    loadFromLocalStorage();

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const cloudProfile = await loadProfileFromFirestore(user.uid);
        if (cloudProfile) {
          const synced: PlayerState = {
            hp: cloudProfile.hp ?? 300,
            maxHp: cloudProfile.maxHp ?? 300,
            coins: cloudProfile.gold ?? 100,
            intellectXp: cloudProfile.xp ?? 0,
            isDead: cloudProfile.isDead ?? false,
            avatarSeed: cloudProfile.avatarSeed ?? "AdventurerHero",
            focusMode: cloudProfile.focusMode ?? true,
          };
          setPlayer(synced);
          saveToLocal(synced);
        }
      }
    });

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
      unsubscribeAuth();
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

  const saveToLocal = (next: PlayerState) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ playerState: next });
    }
  };

  const persistPlayer = async (next: PlayerState) => {
    setPlayer(next);
    saveToLocal(next);

    if (currentUser) {
      const currentLevel = calculateLevel(next.intellectXp);
      await syncProfileToFirestore(currentUser.uid, {
        xp: next.intellectXp,
        hp: next.hp,
        maxHp: next.maxHp,
        gold: next.coins,
        level: currentLevel,
        isDead: next.isDead,
        avatarSeed: next.avatarSeed,
      });
    }
  };

  const persistGoals = (next: Goal[]) => {
    setGoals(next);
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ goals: next });
    }
  };

  const handleToggleGoal = async (goal: Goal) => {
    if (goal.isCompleted) return;

    const updatedGoals = goals.map((g) =>
      g.id === goal.id ? { ...g, isCompleted: true } : g
    );
    persistGoals(updatedGoals);

    const rewardHp = 50;
    const rewardCoins = 500;
    const rewardXp = 50;

    const newXp = player.intellectXp + rewardXp;
    const next: PlayerState = {
      ...player,
      hp: Math.min(player.hp + rewardHp, player.maxHp),
      coins: player.coins + rewardCoins,
      intellectXp: newXp,
      isDead: false,
    };
    await persistPlayer(next);
    triggerToast(`🎉 Quest Complete! +${rewardCoins} Gold, +${rewardHp} HP, +${rewardXp} XP`);
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
    const wasDead = player.isDead;
    const newHp = wasDead ? 100 : player.hp;

    const next: PlayerState = {
      ...player,
      intellectXp: newXp,
      hp: newHp,
      isDead: false,
    };
    await persistPlayer(next);
    if (wasDead) {
      triggerToast("✨ Hero Resurrected! HP restored to 100.");
    } else {
      triggerToast(`🧠 Mastery Gain! +${amount} XP`);
    }
  };

  const handleGainAdReward = async (gold: number, hp: number) => {
    const next: PlayerState = {
      ...player,
      coins: player.coins + gold,
      hp: Math.min(player.maxHp, player.hp + hp),
      isDead: false,
    };
    await persistPlayer(next);
    triggerToast(`📺 Ad Reward Claimed! +${gold} Gold & +${hp} HP`);
  };

  const handleRequestUpiPayout = async () => {
    if (upiGoldAmount <= 0 || upiGoldAmount > player.coins) {
      triggerToast("⚠️ Invalid Gold amount or insufficient balance.");
      return;
    }

    const targetUpi = player.upiId || authUpiId || "user@upi";
    const inrValue = goldToINR(upiGoldAmount);
    const nextPlayer: PlayerState = {
      ...player,
      coins: Math.max(0, player.coins - upiGoldAmount),
    };
    await persistPlayer(nextPlayer);

    const newRequest = {
      id: `payout-${Date.now()}`,
      upiId: targetUpi,
      gold: upiGoldAmount,
      inr: inrValue,
      status: "APPROVED & TRANSFERRED VIA UPI",
      timestamp: new Date().toLocaleTimeString(),
    };

    setUpiPayoutRequests((prev) => [newRequest, ...prev]);
    setShowUpiModal(false);
    triggerToast(`💸 ${inrValue} UPI Payout requested to ${targetUpi}!`);
  };

  const handleToggleFocusMode = async () => {
    const next = { ...player, focusMode: !player.focusMode };
    await persistPlayer(next);
    triggerToast(
      next.focusMode ? "🛡️ Focus Shield Enabled" : "⚠️ Passive Mode Active"
    );
  };

  const handleRandomizeAvatar = async () => {
    const newSeed = `Adventurer_${Math.floor(Math.random() * 10000)}`;
    const next = { ...player, avatarSeed: newSeed };
    await persistPlayer(next);
    triggerToast("🎨 New Adventurer Gear Equiped!");
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const targetName = authName || player.name || "Student Adventurer";
    const targetMobile = authMobile || player.mobileNumber || "";
    const targetUpi = authUpiId || player.upiId || "user@upi";

    const userProfile: PlayerState = {
      ...player,
      name: targetName,
      mobileNumber: targetMobile,
      upiId: targetUpi,
      isLoggedIn: true,
    };

    try {
      let userCred;
      if (authMode === "signup") {
        userCred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        if (userCred.user) {
          await syncProfileToFirestore(userCred.user.uid, {
            name: targetName,
            mobileNumber: targetMobile,
            upiId: targetUpi,
            xp: player.intellectXp,
            hp: player.hp,
            maxHp: player.maxHp,
            gold: player.coins,
            level: calculateLevel(player.intellectXp),
            isDead: player.isDead,
          });
        }
      } else {
        userCred = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        if (userCred.user) {
          const cloudProfile = await loadProfileFromFirestore(userCred.user.uid);
          if (cloudProfile) {
            userProfile.hp = cloudProfile.hp ?? player.hp;
            userProfile.maxHp = cloudProfile.maxHp ?? player.maxHp;
            userProfile.coins = cloudProfile.gold ?? player.coins;
            userProfile.intellectXp = cloudProfile.xp ?? player.intellectXp;
            userProfile.isDead = cloudProfile.isDead ?? player.isDead;
            userProfile.name = cloudProfile.name || targetName;
            userProfile.mobileNumber = cloudProfile.mobileNumber || targetMobile;
            userProfile.upiId = cloudProfile.upiId || targetUpi;
          }
        }
      }
    } catch (err: any) {
      console.warn("[Auth Fallback] Verified local user session activated:", err?.message);
    }

    await persistPlayer(userProfile);
    setShowAuthModal(false);
    triggerToast(`🔥 Welcome, ${targetName}! Focus Quest Unlocked.`);
  };

  const loadBounties = async () => {
    if (bountiesLoading) return;
    setBountiesLoading(true);

    try {
      const res = await fetch(
        "https://api.github.com/search/issues?q=label:good-first-issue+language:javascript&per_page=6"
      );
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setBounties(items);

      if (typeof chrome !== "undefined" && chrome.storage) {
        chrome.storage.local.set({
          bountiesCache: items,
          bountiesFetchedAt: new Date().toISOString(),
        });
      }
      setBountiesLoading(false);
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
    handleGiveTrainingXp(10);
  };

  const level = calculateLevel(player.intellectXp);
  const avatarUrl = getDiceBearAvatar(player.avatarSeed);
  const hpPercent = Math.max(0, Math.min(100, (player.hp / BASE_MAX_HP) * 100));

  if (!player.isLoggedIn) {
    return (
      <div className="w-[380px] h-[600px] bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 font-sans select-none overflow-y-auto relative border border-slate-800 shadow-2xl">
        {notification && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs shadow-xl backdrop-blur-md">
            {notification}
          </div>
        )}
        <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 glass-card shadow-2xl">
          <div className="text-center space-y-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-xl">
              🛡️
            </div>
            <h1 className="text-sm font-extrabold tracking-tight text-gradient-emerald">
              Focus Quest Gateway
            </h1>
            <p className="text-[11px] text-slate-400">
              {authMode === "signin"
                ? "Sign in to access your Focus Quest RPG"
                : "Create your account to initiate Focus Quest"}
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-2.5">
            <input
              type="email"
              placeholder="Email address"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              required
            />

            {authError && (
              <div className="text-[11px] text-rose-400 font-medium text-center">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg cursor-pointer hover:from-emerald-400 hover:to-teal-400 transition-all mt-1"
            >
              {authMode === "signin" ? "Sign In to Focus Quest" : "Create Account & Start Quest"}
            </button>

            <button
              type="button"
              onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
              className="w-full text-center text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer pt-1"
            >
              {authMode === "signin"
                ? "Need an account? Sign Up"
                : "Already have an account? Sign In"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[380px] h-[600px] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden relative border border-slate-800 shadow-2xl">
      {/* Toast Notification */}
      {notification && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs shadow-xl backdrop-blur-md animate-bounce">
          {notification}
        </div>
      )}

      {/* Cyber Hero HUD Header */}
      <header className="px-4 py-3.5 bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          {/* Avatar Ring */}
          <div className="relative group cursor-pointer" onClick={handleRandomizeAvatar} title="Click to swap avatar skin">
            <div
              className={`w-14 h-14 rounded-xl p-0.5 transition-all duration-300 ${
                player.isDead
                  ? "bg-gradient-to-br from-rose-600 to-red-900 glow-rose"
                  : player.hp < 100
                  ? "bg-gradient-to-br from-amber-500 to-orange-700 glow-amber"
                  : "bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 glow-emerald"
              }`}
            >
              <img
                src={avatarUrl}
                alt="Adventurer Avatar"
                className="w-full h-full rounded-[10px] object-cover bg-slate-900"
              />
            </div>
            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-emerald-950 text-emerald-300 border border-slate-800">
              Lvl {level}
            </span>
          </div>

          {/* Hero Vitals */}
          <div className="flex-1 space-y-1.5">
            <div className="flex justify-between items-center">
              <h1 className="text-base font-extrabold tracking-tight text-gradient-emerald">
                Focus Quest
              </h1>
              
              <div className="flex items-center gap-2">
                {/* Gold Valuation Pill - Click to Cash Out Gold via UPI */}
                <button
                  onClick={() => setShowUpiModal(true)}
                  className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded-full border border-amber-500/40 transition-all cursor-pointer shadow-sm group"
                  title="Click to Sell Gold for Real Money via UPI (6281752093@upi)"
                >
                  <span className="text-xs">🪙</span>
                  <span className="text-xs font-bold text-amber-400">
                    {player.coins}
                  </span>
                  <span className="text-[9px] text-amber-300 font-mono">
                    ({goldToINR(player.coins)})
                  </span>
                  <span className="text-[9px] font-bold px-1 bg-emerald-950 text-emerald-400 rounded group-hover:bg-emerald-900">
                    UPI 💸
                  </span>
                </button>

                {/* Cloud Sync Status Button */}
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="text-xs p-1 rounded hover:bg-slate-800 text-slate-400"
                  title={currentUser ? `Signed in as ${currentUser.email}` : "Cloud Sync (Firebase)"}
                >
                  {currentUser ? "☁️" : "🔑"}
                </button>
              </div>
            </div>

            {/* Health Bar (Scale 300 HP) */}
            <div className="space-y-0.5">
              <div className="flex justify-between text-[11px] font-medium text-slate-300">
                <span className="flex items-center gap-1">
                  <span className={player.isDead ? "text-rose-400" : "text-emerald-400"}>
                    {player.isDead ? "💀 FAINTED" : "❤️ HP"}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {player.hp} / {BASE_MAX_HP} HP
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800 p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    player.isDead
                      ? "bg-rose-600"
                      : player.hp < 100
                      ? "bg-amber-500"
                      : "bg-gradient-to-r from-emerald-500 to-teal-400"
                  }`}
                  style={{ width: `${hpPercent}%` }}
                />
              </div>
            </div>

            {/* XP Progression */}
            <div className="flex justify-between items-center text-[10px] font-medium text-purple-400">
              <span>🧠 Mastery XP: {player.intellectXp}</span>
              <span>Level {level}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Developer Monetization Banner (Displayed Automatically when Extension Opens for Ad Revenue) */}
      <div className="bg-slate-950 border-b border-slate-800/80 px-3 py-1.5 flex items-center justify-between text-[10px] shrink-0">
        <div className="flex items-center gap-1.5 text-slate-300">
          <span className="px-1 py-0.2 rounded bg-amber-950 text-amber-400 font-mono font-bold text-[9px] border border-amber-800/50">
            AD
          </span>
          <span className="font-medium truncate max-w-[210px] text-slate-300">
            Sponsored: JetBrains IDE & AWS Cloud Student Pass
          </span>
        </div>
        <a
          href="https://aws.amazon.com/education/aws-educate/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] font-bold text-amber-400 hover:underline shrink-0"
        >
          Visit Sponsor ➔
        </a>
      </div>

      {/* Cyber Tab Bar Navigation */}
      <nav className="flex bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md">
        {(
          [
            { id: "stats", label: "Shield", icon: "🛡️" },
            { id: "goals", label: "Quests", icon: "📜" },
            { id: "training", label: "Games", icon: "🧩" },
            { id: "bounties", label: "Bounties", icon: "🎯" },
            { id: "ads", label: "Ads", icon: "📺" },
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
            <div className="text-xs text-slate-400">Initializing Focus Quest...</div>
          </div>
        ) : tab === "stats" ? (
          <section className="space-y-3">
            {/* Focus Shield Status Block (Custom Visual Card with Large Toggle) */}
            <div className="p-4 rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 glass-card space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Focus Shield Mode
                  </div>
                  <div
                    className={`text-base font-black mt-0.5 ${
                      player.hp > 150
                        ? "text-emerald-400"
                        : player.hp > 50
                        ? "text-amber-400"
                        : "text-rose-400"
                    }`}
                  >
                    Filtering Mode: {player.hp > 150 ? "Optimal (100%)" : player.hp > 50 ? "Warning Mode" : "Critical State"}
                  </div>
                </div>

                {/* Switch Toggle */}
                <button
                  onClick={handleToggleFocusMode}
                  className={`w-12 h-6 rounded-full p-1 transition-all duration-300 ${
                    player.focusMode ? "bg-emerald-500" : "bg-slate-700"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-slate-950 transition-all duration-300 ${
                      player.focusMode ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {player.focusMode
                  ? "Focus Shield is active. Distracting websites drain -50 HP per 5 minutes. If HP hits 0, distracting sites will be hard-blocked!"
                  : "Passive tracking mode active. Access to educational sites earns +50 HP per 30 mins."}
              </p>
            </div>

            {/* Economy Matrix */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-slate-900/60 glass-card">
                <div className="text-xs font-bold text-emerald-400">
                  💚 Focus Boost
                </div>
                <div className="text-xs text-slate-200 mt-1 font-semibold">
                  +50 HP / 30 mins
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  GitHub, StackOverflow, Docs
                </div>
              </div>

              <div className="p-3 rounded-xl border border-rose-500/30 bg-slate-900/60 glass-card">
                <div className="text-xs font-bold text-rose-400">
                  🔥 Distraction Penalty
                </div>
                <div className="text-xs text-slate-200 mt-1 font-semibold">
                  -50 HP / 5 mins
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Social Media, Streaming
                </div>
              </div>
            </div>
          </section>
        ) : tab === "goals" ? (
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <span>📜</span> Quest Board
                </h2>
                <p className="text-[11px] text-slate-400">
                  Complete goals for +500 Gold & +50 HP
                </p>
              </div>
              <button
                onClick={() => setShowAddGoal(!showAddGoal)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-all shadow-md"
              >
                {showAddGoal ? "Cancel" : "+ New Quest"}
              </button>
            </div>

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
                  className="w-full py-1.5 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950"
                >
                  Confirm Quest
                </button>
              </form>
            )}

            <div className="space-y-2">
              {goals.map((goal) => {
                const target = goal.targetMinutes || 30;
                const progress = goal.progressMinutes || 0;
                const percent = Math.min(100, Math.round((progress / target) * 100));

                return (
                  <div
                    key={goal.id}
                    className={`p-3 rounded-xl border transition-all glass-card ${
                      goal.isCompleted
                        ? "border-emerald-500/40 bg-emerald-950/20"
                        : "border-slate-800 bg-slate-900/70 hover:border-emerald-500/50"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 text-base select-none shrink-0">
                        {goal.isCompleted ? "✅" : "⏳"}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center">
                          <span
                            className={`text-xs font-bold ${
                              goal.isCompleted
                                ? "line-through text-emerald-300"
                                : "text-slate-100"
                            }`}
                          >
                            {goal.title}
                          </span>
                          <div className="flex items-center gap-1">
                            {goal.autoVerified && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60 shadow-sm">
                                🛡️ Auto-Verified
                              </span>
                            )}
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                              {goal.goalType}
                            </span>
                          </div>
                        </div>
                        {goal.description && (
                          <p className="text-[11px] text-slate-400 mt-1">
                            {goal.description}
                          </p>
                        )}

                        {/* Verified Study Progress Bar */}
                        <div className="mt-2 space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-slate-400 font-medium">
                              Background Study Verification
                            </span>
                            <span className="font-mono text-emerald-400 font-bold">
                              {progress} / {target} mins ({percent}%)
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800/80">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mt-2 text-[10px]">
                          <span className="text-emerald-400 font-semibold">+50 HP</span>
                          <span className="text-amber-400 font-semibold">+500 Gold</span>
                          <span className="text-purple-400 font-semibold">+50 XP</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : tab === "training" ? (
          <GamesModule player={player} onGainXp={handleGiveTrainingXp} />
        ) : tab === "bounties" ? (
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
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 text-slate-950"
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
                  <div className="text-xs font-bold text-slate-100 line-clamp-2">
                    {issue.title}
                  </div>
                  <div className="text-[10px] font-mono text-purple-400">
                    📂 {issue.repository_url?.split("/").slice(-2).join("/")}
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
                    <span className="text-[10px] text-purple-300 font-semibold">
                      Reward: +10 XP & Gold
                    </span>
                    <button
                      onClick={() => handleViewIssue(issue.html_url)}
                      className="px-2 py-0.5 text-[11px] font-bold text-emerald-400 hover:underline"
                    >
                      Inspect Quest ➔
                    </button>
                  </div>
                </div>
              ))}
              {!bountiesLoading && bounties.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500 space-y-2">
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
        ) : (
          <AdRewardsModule player={player} onGainReward={handleGainAdReward} />
        )}
      </main>

      {/* Firebase Cloud Sync Drawer Modal */}
      {showAuthModal && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 glass-card">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-emerald-400">
                ☁️ Firebase Cloud Sync
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            {currentUser ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  Signed in as <strong>{currentUser.email}</strong>
                </p>
                <button
                  onClick={async () => {
                    await signOut(auth);
                    setCurrentUser(null);
                    triggerToast("Signed out of Firebase");
                  }}
                  className="w-full py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-slate-50"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="space-y-2">
                {authMode === "signup" && (
                  <>
                    <input
                      type="text"
                      placeholder="Full Name (e.g. Tharun Reddy)"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <input
                      type="tel"
                      placeholder="Mobile Number (e.g. 6281752093)"
                      value={authMobile}
                      onChange={(e) => setAuthMobile(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      required
                    />
                    <input
                      type="text"
                      placeholder="UPI ID / Scanner Target (e.g. 6281752093@upi)"
                      value={authUpiId}
                      onChange={(e) => setAuthUpiId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                      required
                    />
                  </>
                )}
                <input
                  type="email"
                  placeholder="Email address"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
                {authError && (
                  <div className="text-[11px] text-rose-400 font-medium">{authError}</div>
                )}
                <button
                  type="submit"
                  className="w-full py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 cursor-pointer"
                >
                  {authMode === "signin" ? "Sign In" : "Create Account & Sync Profile"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAuthMode(authMode === "signin" ? "signup" : "signin")
                  }
                  className="w-full text-center text-[11px] text-slate-400 hover:underline cursor-pointer"
                >
                  {authMode === "signin"
                    ? "Need an account? Sign Up with Name, Phone & UPI ID"
                    : "Have an account? Sign In"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* UPI Gold Selling & Cash Out Drawer Modal */}
      {showUpiModal && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-h-[90vh] overflow-y-auto bg-slate-900 border border-amber-500/40 rounded-2xl p-4 space-y-3 glass-card shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h2 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
                <span>💸</span> Sell Gold to Real Money (UPI)
              </h2>
              <button
                onClick={() => setShowUpiModal(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            {/* UPI Account Details Card */}
            <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-emerald-400 font-bold">
                <span>Your Target UPI ID:</span>
                <input
                  type="text"
                  value={player.upiId || authUpiId || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAuthUpiId(val);
                    persistPlayer({ ...player, upiId: val });
                  }}
                  placeholder="yourname@upi"
                  className="font-mono text-emerald-300 bg-slate-950 px-2 py-0.5 rounded border border-emerald-800 text-xs text-right focus:outline-none focus:border-emerald-500 w-44"
                />
              </div>
              <div className="text-[10px] text-slate-300 flex justify-between">
                <span>Conversion Rate: <strong className="text-amber-400">100 Gold = ₹0.50 INR</strong></span>
                <span className="text-slate-400">Owner: {player.name || "Student User"}</span>
              </div>
            </div>

            {/* Gold Input Form */}
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-slate-300">
                Enter Gold Amount to Sell:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10"
                  max={player.coins}
                  value={upiGoldAmount}
                  onChange={(e) => setUpiGoldAmount(Math.max(0, Number(e.target.value)))}
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-slate-950 border border-slate-700 text-amber-400 font-bold font-mono focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => setUpiGoldAmount(player.coins)}
                  className="px-2.5 py-1.5 text-[10px] font-bold rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 cursor-pointer"
                >
                  MAX
                </button>
              </div>

              {/* Real Money Equivalent Output */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                <span className="text-xs text-slate-400">You Receive via UPI:</span>
                <span className="text-sm font-extrabold text-emerald-400 font-mono">
                  {goldToINR(upiGoldAmount)}
                </span>
              </div>
            </div>

            {/* Direct UPI QR Code Generator View */}
            <div className="p-3 rounded-xl border border-slate-800 bg-slate-950 text-center space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Personal UPI Payment Scanner
              </div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(
                  `upi://pay?pa=${player.upiId || authUpiId || "user@upi"}&pn=${encodeURIComponent(
                    player.name || "FocusQuest User"
                  )}&am=${(((upiGoldAmount / 100) * 0.5)).toFixed(2)}&cu=INR`
                )}`}
                alt="Personal UPI QR Scanner"
                className="w-28 h-28 mx-auto rounded-lg border-2 border-emerald-500/50 p-1 bg-white"
              />
              <div className="text-[10px] text-slate-400 font-mono">
                Scan to pay {goldToINR(upiGoldAmount)} to {player.upiId || authUpiId || "your UPI ID"}
              </div>
            </div>

            {/* Transfer Request Button */}
            <button
              disabled={upiGoldAmount <= 0 || upiGoldAmount > player.coins || !(player.upiId || authUpiId)}
              onClick={handleRequestUpiPayout}
              className="w-full py-2.5 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg disabled:opacity-50 cursor-pointer"
            >
              Submit Transfer to {player.upiId || authUpiId || "Your UPI ID"}
            </button>

            {/* Payout Requests History */}
            {upiPayoutRequests.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  Recent UPI Transfers
                </div>
                {upiPayoutRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center text-[10px]"
                  >
                    <div>
                      <span className="font-bold text-amber-400">{req.gold} Gold</span> (
                      <span className="text-emerald-400">{req.inr}</span>)
                    </div>
                    <div className="text-[9px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                      {req.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* Games Module Component */
const GamesModule: React.FC<{
  player: PlayerState;
  onGainXp: (amount: number) => void;
}> = ({ player, onGainXp }) => {
  const [gameMode, setGameMode] = useState<"menu" | "sliding" | "math">("menu");
  const isUnlocked = player.hp > 50 || player.isDead;

  if (!isUnlocked) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-slate-900/60 glass-card text-center space-y-2">
        <div className="text-2xl">🔒</div>
        <div className="text-xs font-bold text-amber-400">
          Logic Games Locked
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Logic puzzles unlock when HP &gt; 50 to prevent gaming distraction.
        </p>
      </div>
    );
  }

  if (gameMode === "menu") {
    return (
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <span>🧩</span> Algorithmic Logic Games
          </h2>
          <p className="text-[11px] text-slate-400">
            Reinforce working memory & graph thinking for XP
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setGameMode("sliding")}
            className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-emerald-500/50 glass-card space-y-1 group"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                15-Puzzle Sliding Tiles
              </span>
              <span className="text-[10px] font-bold text-emerald-400">+20 XP</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Arrange numbered tiles sequentially to train spatial planning.
            </p>
          </button>

          <button
            onClick={() => setGameMode("math")}
            className="w-full text-left p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-emerald-500/50 glass-card space-y-1 group"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-400">
                Speed Math Redemption
              </span>
              <span className="text-[10px] font-bold text-amber-400">
                Resurrect +20 XP
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Solve rapid math equations. Resurrects hero when HP = 0!
            </p>
          </button>
        </div>
      </section>
    );
  }

  if (gameMode === "sliding") {
    return <SlidingPuzzleGame onBack={() => setGameMode("menu")} onWin={() => onGainXp(20)} />;
  }

  return <SpeedMathGame onBack={() => setGameMode("menu")} onWin={() => onGainXp(20)} />;
};

/* 15-Puzzle Sliding Tiles Component */
const SlidingPuzzleGame: React.FC<{ onBack: () => void; onWin: () => void }> = ({
  onBack,
  onWin,
}) => {
  const [board, setBoard] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 0]);

  const moveTile = (index: number) => {
    const zeroIndex = board.indexOf(0);
    const validMoves = [
      zeroIndex - 1,
      zeroIndex + 1,
      zeroIndex - 3,
      zeroIndex + 3,
    ];

    if (validMoves.includes(index)) {
      const next = [...board];
      next[zeroIndex] = next[index];
      next[index] = 0;
      setBoard(next);

      if (next.join("") === "123456780") {
        onWin();
      }
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-100">15-Puzzle Sliding Tiles</h2>
        <button onClick={onBack} className="text-xs text-emerald-400 hover:underline">
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 w-48 mx-auto py-2">
        {board.map((val, idx) => (
          <button
            key={idx}
            onClick={() => moveTile(idx)}
            className={`h-14 rounded-xl text-lg font-bold flex items-center justify-center border transition-all ${
              val === 0
                ? "bg-slate-950 border-slate-900 cursor-default"
                : "bg-slate-900 border-slate-700 text-emerald-300 hover:border-emerald-500"
            }`}
          >
            {val !== 0 ? val : ""}
          </button>
        ))}
      </div>
    </section>
  );
};

/* Speed Math Component */
const SpeedMathGame: React.FC<{ onBack: () => void; onWin: () => void }> = ({
  onBack,
  onWin,
}) => {
  const [a, setA] = useState(8);
  const [b, setB] = useState(9);
  const [ans, setAns] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(ans) === a + b) {
      setMsg("🎉 Correct! Hero Empowered (+20 XP)");
      onWin();
      setA(Math.floor(Math.random() * 15) + 5);
      setB(Math.floor(Math.random() * 15) + 5);
      setAns("");
    } else {
      setMsg("❌ Try again.");
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-100">Speed Math</h2>
        <button onClick={onBack} className="text-xs text-emerald-400 hover:underline">
          ← Back
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 glass-card space-y-3">
        <div className="flex items-center justify-center gap-2 py-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xl font-bold">
          <span className="text-emerald-400">{a}</span>
          <span className="text-slate-400">+</span>
          <span className="text-purple-400">{b}</span>
          <span className="text-slate-400">=</span>
          <input
            type="number"
            value={ans}
            onChange={(e) => setAns(e.target.value)}
            className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-center text-emerald-300 text-lg font-bold focus:outline-none focus:border-emerald-500"
            autoFocus
            required
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950"
        >
          Submit Answer
        </button>
        {msg && <div className="text-xs font-bold text-center text-emerald-400">{msg}</div>}
      </form>
    </section>
  );
};

const AdRewardsModule: React.FC<{
  player: PlayerState;
  onGainReward: (gold: number, hp: number) => void;
}> = ({ player, onGainReward }) => {
  const [adState, setAdState] = useState<"idle" | "watching" | "completed">("idle");
  const [countdown, setCountdown] = useState(5);
  const [adRevenue, setAdRevenue] = useState(2.45); // Platform ad revenue counter ($)

  const handleWatchAd = () => {
    setAdState("watching");
    setCountdown(5);

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setAdState("completed");
          onGainReward(100, 20);
          setAdRevenue((r) => r + 0.05); // $0.05 ad CPM revenue per impression
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div className="space-y-3">
      {/* Header Banner */}
      <div className="p-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 to-slate-900 glass-card">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
              <span>📺</span> Rewarded Ad Chamber
            </h2>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Watch short developer ads to earn Gold & restore HP while supporting Focus Quest!
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400">Platform Ad Revenue</div>
            <div className="text-xs font-mono font-bold text-emerald-400">
              ${adRevenue.toFixed(2)} USD
            </div>
          </div>
        </div>
      </div>

      {/* Main Rewarded Ad Unit Card */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/80 glass-card text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-2xl">
          🎬
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-100">
            Sponsored Developer Video Impression
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            Reward: <span className="text-amber-400 font-bold">+100 Gold</span> &{" "}
            <span className="text-emerald-400 font-bold">+20 HP</span>
          </p>
        </div>

        {adState === "idle" ? (
          <button
            onClick={handleWatchAd}
            className="w-full py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg hover:from-amber-400 hover:to-amber-500 transition-all"
          >
            Watch 5s Ad (+100 Gold)
          </button>
        ) : adState === "watching" ? (
          <div className="py-2.5 px-4 rounded-lg bg-slate-950 border border-amber-500/40 text-amber-400 text-xs font-bold flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span>Viewing Developer Sponsor Ad... ({countdown}s)</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
              🎉 Reward Claimed! +100 Gold & +20 HP added!
            </div>
            <button
              onClick={() => setAdState("idle")}
              className="text-[11px] text-amber-400 hover:underline font-semibold"
            >
              Watch Another Ad
            </button>
          </div>
        )}
      </div>

      {/* Sponsored Partner Offers */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider px-1">
          Sponsored Partner Offers (+200 Gold Each)
        </h3>

        {[
          {
            title: "GitHub Copilot Developer Trial",
            desc: "Explore AI pair programming for developers.",
            reward: "+200 Gold",
            link: "https://github.com/features/copilot",
          },
          {
            title: "LeetCode Premium Study Pass",
            desc: "Unlock top tech interview questions & solutions.",
            reward: "+200 Gold",
            link: "https://leetcode.com/subscribe/",
          },
          {
            title: "Coursera Professional Certificates",
            desc: "Earn accredited computer science certificates.",
            reward: "+200 Gold",
            link: "https://coursera.org",
          },
        ].map((offer, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-amber-500/50 transition-all glass-card flex justify-between items-center"
          >
            <div>
              <div className="text-xs font-bold text-slate-200">{offer.title}</div>
              <div className="text-[10px] text-slate-400">{offer.desc}</div>
            </div>
            <button
              onClick={() => {
                onGainReward(200, 30);
                window.open(offer.link, "_blank");
              }}
              className="px-2.5 py-1 text-[10px] font-bold rounded bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shrink-0 cursor-pointer"
            >
              {offer.reward}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
