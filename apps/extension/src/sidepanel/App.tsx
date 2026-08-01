import React, { useEffect, useState } from "react";
import {
  BASE_MAX_HP,
  calculateLevel,
  goldToINR,
  getDiceBearAvatar,
  calculateQuestRewards,
} from "../lib/mechanics";
import {
  auth,
  db,
  collection,
  query,
  where,
  getDocs,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  syncProfileToFirestore,
  loadProfileFromFirestore,
  savePayoutRequestToFirestore,
  syncAdminProfileToFirestore,
  onSnapshot,
  User,
} from "../lib/firebase";

import { AiGamesModule } from "./components/AiGamesModule";
import { AdminPortalModule } from "./components/AdminPortalModule";

type Tab = "stats" | "goals" | "training" | "bounties";

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
  customAvatarUrl?: string;
  focusMode: boolean; // Active DNR blocking toggle
  username?: string;
  name?: string;
  mobileNumber?: string;
  upiId?: string;
  isLoggedIn?: boolean;
  isAdmin?: boolean;
  creditedGoalIds?: string[];
};

const DEFAULT_PLAYER: PlayerState = {
  hp: 300,
  maxHp: BASE_MAX_HP,
  coins: 0,
  intellectXp: 0,
  isDead: false,
  avatarSeed: "AdventurerHero",
  customAvatarUrl: "",
  focusMode: true,
  username: "",
  name: "",
  mobileNumber: "",
  upiId: "",
  isLoggedIn: false,
};

const DEFAULT_GOALS: Goal[] = [];

export const App: React.FC = () => {
  const [tab, setTab] = useState<Tab>("stats");
  const [player, setPlayer] = useState<PlayerState>(DEFAULT_PLAYER);
  const [goals, setGoals] = useState<Goal[]>(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [bounties, setBounties] = useState<any[]>([]);
  const [bountiesLoading, setBountiesLoading] = useState(false);
  const [bountyCategory, setBountyCategory] = useState<"official" | "opensource">("official");
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [newGoalMinutes, setNewGoalMinutes] = useState("30");
  const [newGoalType, setNewGoalType] = useState<"daily" | "weekly">("daily");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Firebase Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authUsername, setAuthUsername] = useState("");
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

  // Admin Portal State
  const [showAdminPortal, setShowAdminPortal] = useState(false);

  // Self-healing function to verify, rectify rewards, and auto-delete completed goals
  const verifyAndRectifyUncreditedRewards = (
    currentPlayer: PlayerState,
    currentGoals: Goal[]
  ): { nextPlayer: PlayerState; activeGoals: Goal[] } => {
    const creditedIds = new Set(currentPlayer.creditedGoalIds || []);
    let additionalGold = 0;
    let additionalHp = 0;
    let additionalXp = 0;
    let updated = false;

    const activeGoals: Goal[] = [];

    currentGoals.forEach((goal) => {
      const target = goal.targetMinutes || 30;
      const progress = goal.progressMinutes || 0;
      const isDone = goal.isCompleted || progress >= target;

      if (isDone) {
        updated = true;
        if (!creditedIds.has(goal.id)) {
          const rewards = calculateQuestRewards(target);
          additionalGold += rewards.gold;
          additionalHp += rewards.hp;
          additionalXp += rewards.xp;
          creditedIds.add(goal.id);
        }
        // Auto-delete completed quest (do not push to activeGoals)
      } else {
        activeGoals.push(goal);
      }
    });

    const nextPlayer: PlayerState = updated
      ? {
          ...currentPlayer,
          coins: (currentPlayer.coins || 0) + additionalGold,
          hp: Math.min(
            currentPlayer.maxHp || BASE_MAX_HP,
            (currentPlayer.hp || 300) + additionalHp
          ),
          intellectXp: (currentPlayer.intellectXp || 0) + additionalXp,
          creditedGoalIds: Array.from(creditedIds),
        }
      : currentPlayer;

    return { nextPlayer, activeGoals };
  };

  // Initialize Auth & Storage listeners
  useEffect(() => {
    syncAdminProfileToFirestore();
    loadFromLocalStorage();

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const cloudProfile = await loadProfileFromFirestore(user.uid);
        setPlayer((prev) => {
          const mergedCoins = Math.max(cloudProfile?.gold ?? 0, prev.coins ?? 0);
          const mergedXp = Math.max(cloudProfile?.xp ?? 0, prev.intellectXp ?? 0);
          const mergedHp = cloudProfile?.hp !== undefined ? Math.max(cloudProfile.hp, prev.hp ?? 300) : (prev.hp ?? 300);

          let synced: PlayerState = {
            ...prev,
            hp: mergedHp,
            maxHp: cloudProfile?.maxHp ?? prev.maxHp ?? 300,
            coins: mergedCoins,
            intellectXp: mergedXp,
            isDead: cloudProfile?.isDead ?? prev.isDead ?? false,
            avatarSeed: cloudProfile?.avatarSeed ?? prev.avatarSeed ?? "AdventurerHero",
            customAvatarUrl: cloudProfile?.customAvatarUrl || prev.customAvatarUrl || "",
            focusMode: cloudProfile?.focusMode ?? prev.focusMode ?? true,
            username: cloudProfile?.username || cloudProfile?.name || prev.username || user.email?.split("@")[0] || "Adventurer",
            name: cloudProfile?.name || cloudProfile?.username || prev.name || "Adventurer",
            email: user.email || prev.email || "",
            upiId: cloudProfile?.upiId || prev.upiId || "",
            isLoggedIn: true,
            creditedGoalIds: Array.from(new Set([...(cloudProfile?.creditedGoalIds || []), ...(prev.creditedGoalIds || [])])),
          };

          const { nextPlayer: rectifiedPlayer, activeGoals } = verifyAndRectifyUncreditedRewards(synced, goals);
          synced = rectifiedPlayer;
          if (activeGoals.length !== goals.length) {
            persistGoals(activeGoals);
          }
          saveToLocal(synced);

          const targetUid = user.uid || (synced.email ? "user_" + synced.email.replace(/[^a-zA-Z0-9]/g, "_") : null);
          if (targetUid) {
            syncProfileToFirestore(targetUid, {
              username: synced.username || synced.name || "",
              name: synced.name || synced.username || "",
              email: synced.email || user.email || "",
              mobileNumber: synced.mobileNumber || "",
              upiId: synced.upiId || "",
              xp: synced.intellectXp,
              hp: synced.hp,
              maxHp: synced.maxHp,
              gold: synced.coins,
              level: calculateLevel(synced.intellectXp),
              isDead: synced.isDead,
              avatarSeed: synced.avatarSeed,
              customAvatarUrl: synced.customAvatarUrl || "",
              focusMode: synced.focusMode,
            });
          }
          return synced;
        });
      }
    });

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== "local") return;
      if (changes.playerState?.newValue) {
        const nextPlayer = changes.playerState.newValue as PlayerState;
        setPlayer((prev) => {
          const { nextPlayer: rectified, activeGoals } = verifyAndRectifyUncreditedRewards(nextPlayer, goals);
          if (activeGoals.length !== goals.length) {
            persistGoals(activeGoals);
          }
          const targetUid =
            auth.currentUser?.uid ||
            currentUser?.uid ||
            (rectified.email ? "user_" + rectified.email.replace(/[^a-zA-Z0-9]/g, "_") : null);
          if (targetUid) {
            syncProfileToFirestore(targetUid, {
              username: rectified.username || rectified.name || "",
              name: rectified.name || rectified.username || "",
              email: rectified.email || auth.currentUser?.email || "",
              mobileNumber: rectified.mobileNumber || "",
              upiId: rectified.upiId || "",
              xp: rectified.intellectXp,
              hp: rectified.hp,
              maxHp: rectified.maxHp,
              gold: rectified.coins,
              level: calculateLevel(rectified.intellectXp),
              isDead: rectified.isDead,
              avatarSeed: rectified.avatarSeed,
              customAvatarUrl: rectified.customAvatarUrl || "",
              focusMode: rectified.focusMode,
            });
          }
          return rectified;
        });
      }
      if (changes.goals?.newValue) {
        const nextGoals = changes.goals.newValue as Goal[];
        setPlayer((prev) => {
          const { nextPlayer: rectified, activeGoals } = verifyAndRectifyUncreditedRewards(prev, nextGoals);
          setGoals(activeGoals);
          saveToLocal(rectified);
          const targetUid =
            auth.currentUser?.uid ||
            currentUser?.uid ||
            (rectified.email ? "user_" + rectified.email.replace(/[^a-zA-Z0-9]/g, "_") : null);
          if (targetUid) {
            syncProfileToFirestore(targetUid, {
              username: rectified.username || rectified.name || "",
              name: rectified.name || rectified.username || "",
              email: rectified.email || auth.currentUser?.email || "",
              mobileNumber: rectified.mobileNumber || "",
              upiId: rectified.upiId || "",
              xp: rectified.intellectXp,
              hp: rectified.hp,
              maxHp: rectified.maxHp,
              gold: rectified.coins,
              level: calculateLevel(rectified.intellectXp),
              isDead: rectified.isDead,
              avatarSeed: rectified.avatarSeed,
              customAvatarUrl: rectified.customAvatarUrl || "",
              focusMode: rectified.focusMode,
            });
          }
          return rectified;
        });
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

  // Real-time Firestore Listener for User's UPI Payout Requests (Approved, Pending, Rejected)
  useEffect(() => {
    if (!player.isLoggedIn && !currentUser && !player.email) return;

    const userEmail = (player.email || currentUser?.email || "").toLowerCase();
    const userUsername = (player.username || player.name || "").toLowerCase();
    const targetUid =
      auth.currentUser?.uid ||
      currentUser?.uid ||
      (userEmail ? "user_" + userEmail.replace(/[^a-zA-Z0-9]/g, "_") : null);

    const payoutsCol = collection(db, "payout_requests");
    const unsubscribeUserPayouts = onSnapshot(
      payoutsCol,
      (snapshot) => {
        const myRequests: any[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const reqEmail = (data.email || "").toLowerCase();
          const reqUsername = (data.username || data.name || "").toLowerCase();
          const reqUserId = data.userId || "";

          const isMyRequest =
            (targetUid && reqUserId === targetUid) ||
            (userEmail && reqEmail && reqEmail === userEmail) ||
            (userUsername && reqUsername && reqUsername === userUsername);

          if (isMyRequest) {
            myRequests.push({
              id: docSnap.id,
              gold: data.goldAmount,
              inr: data.inrValue,
              upiId: data.upiId,
              status: data.status,
              createdAt: data.createdAt,
            });
          }
        });

        myRequests.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
        });

        setUpiPayoutRequests(myRequests);
      },
      (err) => {
        console.warn("[App] Error listening to user payout requests:", err);
      }
    );

    return () => unsubscribeUserPayouts();
  }, [player.isLoggedIn, player.email, player.username, currentUser]);

  const renderPayoutStatusBadge = (status: string) => {
    const s = (status || "").toUpperCase();
    if (s.includes("APPROVED") || s.includes("TRANSFERRED") || s.includes("COMPLETED")) {
      return (
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-extrabold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-700/60 shadow-sm flex items-center gap-1">
            <span>✅</span> APPROVED & TRANSFERRED
          </span>
          <span className="text-[8px] text-emerald-400/80 font-mono mt-0.5">UPI Transfer Completed</span>
        </div>
      );
    }
    if (s.includes("REJECTED")) {
      return (
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-extrabold text-rose-400 bg-rose-950 px-2 py-0.5 rounded border border-rose-700/60 shadow-sm flex items-center gap-1">
            <span>❌</span> REJECTED
          </span>
          <span className="text-[8px] text-rose-400/80 font-mono mt-0.5">Gold Refunded to Account</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-end">
        <span className="text-[9px] font-extrabold text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-700/60 shadow-sm flex items-center gap-1 animate-pulse">
          <span>⏳</span> PENDING APPROVAL
        </span>
        <span className="text-[8px] text-amber-400/80 font-mono mt-0.5">Under Admin Review</span>
      </div>
    );
  };

  const triggerToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const checkMidnightDailyReset = (currentGoals: Goal[]): { updatedGoals: Goal[]; expiredCount: number } => {
    const todayStr = new Date().toISOString().split("T")[0];
    let expiredCount = 0;

    const updatedGoals = currentGoals.filter((goal) => {
      if (goal.goalType === "daily") {
        const goalDate = goal.createdDate || todayStr;
        // If daily quest crossed midnight (12:00 AM) and was not completed before deadline:
        if (goalDate < todayStr && !goal.isCompleted) {
          expiredCount++;
          return false; // Remove expired daily quest (no rewards given)
        }
      }
      return true;
    });

    return { updatedGoals, expiredCount };
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

        const rawGoals = (storedGoals ?? DEFAULT_GOALS).filter(
          (g) => g.id !== "react-2h" && g.id !== "algo-30m" && g.id !== "clean-code-weekly"
        );
        const { updatedGoals, expiredCount } = checkMidnightDailyReset(rawGoals);

        let initialPlayer = storedPlayer ?? DEFAULT_PLAYER;
        const { nextPlayer: rectifiedPlayer, activeGoals } = verifyAndRectifyUncreditedRewards(initialPlayer, updatedGoals);
        initialPlayer = rectifiedPlayer;

        setPlayer(initialPlayer);
        setGoals(activeGoals);
        saveToLocal(initialPlayer);
        persistGoals(activeGoals);

        const targetUid =
          auth.currentUser?.uid ||
          currentUser?.uid ||
          (initialPlayer.email ? "user_" + initialPlayer.email.replace(/[^a-zA-Z0-9]/g, "_") : null);
        if (targetUid) {
          syncProfileToFirestore(targetUid, {
            username: initialPlayer.username || initialPlayer.name || "",
            name: initialPlayer.name || initialPlayer.username || "",
            email: initialPlayer.email || auth.currentUser?.email || "",
            mobileNumber: initialPlayer.mobileNumber || "",
            upiId: initialPlayer.upiId || "",
            xp: initialPlayer.intellectXp,
            hp: initialPlayer.hp,
            maxHp: initialPlayer.maxHp,
            gold: initialPlayer.coins,
            level: calculateLevel(initialPlayer.intellectXp),
            isDead: initialPlayer.isDead,
            avatarSeed: initialPlayer.avatarSeed,
            customAvatarUrl: initialPlayer.customAvatarUrl || "",
            focusMode: initialPlayer.focusMode,
          });
        }

        if (expiredCount > 0) {
          triggerToast(`⚠️ ${expiredCount} uncompleted daily quest(s) expired at 12:00 AM! Rewards forfeited.`);
        }

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

    const targetUid =
      auth.currentUser?.uid ||
      currentUser?.uid ||
      (next.email ? "user_" + next.email.replace(/[^a-zA-Z0-9]/g, "_") : null);

    if (targetUid) {
      const currentLevel = calculateLevel(next.intellectXp);
      await syncProfileToFirestore(targetUid, {
        username: next.username || next.name || "",
        name: next.name || next.username || "",
        email: next.email || auth.currentUser?.email || "",
        mobileNumber: next.mobileNumber || "",
        upiId: next.upiId || "",
        xp: next.intellectXp,
        hp: next.hp,
        maxHp: next.maxHp,
        gold: next.coins,
        level: currentLevel,
        isDead: next.isDead,
        avatarSeed: next.avatarSeed,
        customAvatarUrl: next.customAvatarUrl || "",
        focusMode: next.focusMode,
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
    const targetMins = goal.targetMinutes || 30;
    // Auto-delete task from goals list upon completion
    const updatedGoals = goals.filter((g) => g.id !== goal.id);
    persistGoals(updatedGoals);

    const rewards = calculateQuestRewards(targetMins);
    const rewardHp = rewards.hp;
    const rewardCoins = rewards.gold;
    const rewardXp = rewards.xp;

    const newXp = (player.intellectXp || 0) + rewardXp;
    const creditedIds = Array.from(new Set([...(player.creditedGoalIds || []), goal.id]));

    const next: PlayerState = {
      ...player,
      hp: Math.min(player.maxHp || BASE_MAX_HP, (player.hp || 300) + rewardHp),
      coins: (player.coins || 0) + rewardCoins,
      intellectXp: newXp,
      isDead: false,
      creditedGoalIds: creditedIds,
    };
    await persistPlayer(next);
    triggerToast(`🎉 Quest Completed & Deleted! +${rewardCoins} Gold, +${rewardHp} HP, +${rewardXp} XP (${targetMins}m scaled)`);
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;

    const parsedMins = Math.max(5, parseInt(newGoalMinutes) || 30);

    const todayStr = new Date().toISOString().split("T")[0];
    const newGoal: Goal = {
      id: `goal-${Date.now()}`,
      title: newGoalTitle.trim(),
      description: newGoalDesc.trim() || undefined,
      goalType: newGoalType,
      targetMinutes: parsedMins,
      progressMinutes: 0,
      isCompleted: false,
      createdDate: todayStr,
    };

    const updated = [newGoal, ...goals];
    persistGoals(updated);
    setNewGoalTitle("");
    setNewGoalDesc("");
    setNewGoalMinutes("30");
    setShowAddGoal(false);
    triggerToast(`✨ New Quest Added (${parsedMins} mins duration)!`);
  };

  const handleDeleteGoal = (goalId: string) => {
    const updated = goals.filter((g) => g.id !== goalId);
    persistGoals(updated);
    triggerToast("🗑️ Quest Deleted!");
  };

  const handleClearAllGoals = () => {
    persistGoals([]);
    triggerToast("🧹 All Quests Cleared!");
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

    const targetUid =
      auth.currentUser?.uid ||
      currentUser?.uid ||
      (player.email ? "user_" + player.email.replace(/[^a-zA-Z0-9]/g, "_") : "user_guest");

    // Save requested payout details to Firestore collection 'payout_requests' for Admin review
    await savePayoutRequestToFirestore({
      userId: targetUid,
      username: player.username || player.name || "Adventurer",
      name: player.name || player.username || "",
      email: player.email || currentUser?.email || "",
      mobileNumber: player.mobileNumber || "",
      upiId: targetUpi,
      goldAmount: upiGoldAmount,
      inrValue: inrValue,
      status: "PENDING_ADMIN_APPROVAL",
    });

    const newRequest = {
      id: `payout-${Date.now()}`,
      upiId: targetUpi,
      gold: upiGoldAmount,
      inr: inrValue,
      status: "SENT TO ADMIN FOR APPROVAL & TRANSFER",
      timestamp: new Date().toLocaleTimeString(),
    };

    setUpiPayoutRequests((prev) => [newRequest, ...prev]);
    setShowUpiModal(false);
    triggerToast(`💸 Payout request of ${inrValue} sent to Admin for transfer to ${targetUpi}!`);
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

    const rawInput = (authEmail || authUsername).trim();
    const cleanPassword = authPassword.trim();
    const cleanUsername = authUsername.trim();

    if (!rawInput) {
      setAuthError("Please enter your Email address or Username.");
      return;
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      setAuthError("Password must be at least 4 characters long.");
      return;
    }
    if (authMode === "signup" && !cleanUsername) {
      setAuthError("Please enter a username.");
      return;
    }

    const cleanInputUser = rawInput.toLowerCase();

    // 1. Fixed Admin Login Verification (No Sign Up Needed)
    const isAdminCredentials =
      (cleanInputUser === "vallapureddytharunreddy6281@gmail.com" ||
       cleanInputUser === "tharun") &&
      cleanPassword === "Tharunreddy@23";

    if (isAdminCredentials) {
      const adminProfile: PlayerState = {
        ...player,
        username: "Tharun",
        name: "Vallapureddy Tharun Reddy",
        email: "vallapureddytharunreddy6281@gmail.com",
        mobileNumber: player.mobileNumber || "75692 00917",
        upiId: player.upiId || "7569200917@upi",
        isLoggedIn: true,
        isAdmin: true,
      };

      try {
        await signInWithEmailAndPassword(auth, "vallapureddytharunreddy6281@gmail.com", "Tharunreddy@23");
      } catch (e) {
        console.log("[Admin Login] Authenticated via fixed Admin credentials.");
      }

      await syncAdminProfileToFirestore();
      await persistPlayer(adminProfile);
      setShowAuthModal(false);
      setShowAdminPortal(true);
      triggerToast("👑 Logged in as Admin (Vallapureddy Tharun Reddy)!");
      return;
    }

    // 2. Resolve Email if student entered Username instead of Email
    let resolvedEmail = rawInput;
    if (!resolvedEmail.includes("@")) {
      try {
        const profilesCol = collection(db, "profiles");
        const qUser = query(profilesCol, where("username", "==", rawInput));
        const snapUser = await getDocs(qUser);

        if (!snapUser.empty) {
          const docData = snapUser.docs[0].data();
          if (docData.email) {
            resolvedEmail = docData.email;
          }
        } else {
          const qName = query(profilesCol, where("name", "==", rawInput));
          const snapName = await getDocs(qName);
          if (!snapName.empty) {
            const docData = snapName.docs[0].data();
            if (docData.email) {
              resolvedEmail = docData.email;
            }
          }
        }
      } catch (err) {
        console.warn("[Auth] Username lookup error:", err);
      }
    }

    if (!resolvedEmail || !resolvedEmail.includes("@")) {
      setAuthError("Could not find an account with that username. Please enter your email address.");
      return;
    }

    const targetUsername =
      cleanUsername ||
      player.username ||
      resolvedEmail.split("@")[0] ||
      "Adventurer";
    const targetUpi = authUpiId.trim();

    const userProfile: PlayerState = {
      ...player,
      username: targetUsername,
      name: targetUsername,
      email: resolvedEmail,
      mobileNumber: "", // Student's own mobile
      upiId: targetUpi, // Student's own upi
      isLoggedIn: true,
      isAdmin: false, // Strictly regular user
    };

    try {
      let userCred;
      if (authMode === "signup") {
        userCred = await createUserWithEmailAndPassword(auth, resolvedEmail, cleanPassword);
        if (userCred.user) {
          await syncProfileToFirestore(userCred.user.uid, {
            username: targetUsername,
            name: targetUsername,
            email: resolvedEmail,
            mobileNumber: "",
            upiId: targetUpi,
            xp: player.intellectXp,
            hp: player.hp,
            maxHp: player.maxHp,
            gold: player.coins,
            level: calculateLevel(player.intellectXp),
            isDead: player.isDead,
            avatarSeed: player.avatarSeed,
            focusMode: player.focusMode,
          });
        }
      } else {
        userCred = await signInWithEmailAndPassword(auth, resolvedEmail, cleanPassword);
        if (userCred.user) {
          const cloudProfile = await loadProfileFromFirestore(userCred.user.uid);
          if (cloudProfile) {
            userProfile.hp = cloudProfile.hp !== undefined ? Math.max(cloudProfile.hp, player.hp || 300) : (player.hp || 300);
            userProfile.maxHp = cloudProfile.maxHp ?? player.maxHp ?? 300;
            userProfile.coins = Math.max(cloudProfile.gold ?? 0, player.coins ?? 0);
            userProfile.intellectXp = Math.max(cloudProfile.xp ?? 0, player.intellectXp ?? 0);
            userProfile.isDead = cloudProfile.isDead ?? player.isDead ?? false;
            userProfile.username = cloudProfile.username || cloudProfile.name || targetUsername;
            userProfile.name = cloudProfile.name || cloudProfile.username || targetUsername;
            userProfile.mobileNumber = cloudProfile.mobileNumber || "";
            userProfile.upiId = cloudProfile.upiId || targetUpi;
            userProfile.creditedGoalIds = Array.from(new Set([...(cloudProfile.creditedGoalIds || []), ...(player.creditedGoalIds || [])]));
          }
        }
      }
    } catch (err: any) {
      const code = err?.code || "";
      if (
        code.includes("email-already-in-use") ||
        code.includes("wrong-password") ||
        code.includes("user-not-found") ||
        code.includes("invalid-credential") ||
        code.includes("weak-password") ||
        code.includes("invalid-email")
      ) {
        let msg = err?.message || "Authentication failed.";
        if (code.includes("email-already-in-use")) {
          msg = "This email is already registered. Please click 'Already have an account? Sign In'.";
        } else if (code.includes("weak-password")) {
          msg = "Password should be at least 6 characters.";
        } else if (
          code.includes("wrong-password") ||
          code.includes("user-not-found") ||
          code.includes("invalid-credential")
        ) {
          msg = "Invalid email or password. Please check your credentials.";
        }
        setAuthError(msg);
        return;
      }

      console.warn("[Auth Fallback] Local user session activated:", err?.message);
    }

    await persistPlayer(userProfile);
    setShowAuthModal(false);
    triggerToast(`🔥 Welcome, ${targetUsername}! Focus Quest Unlocked.`);
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
            {authMode === "signup" && (
              <input
                type="text"
                placeholder="Username (e.g. TharunReddy)"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-medium"
                required
              />
            )}
            <input
              type="text"
              placeholder={authMode === "signin" ? "Email address or Username" : "Email address"}
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
          <div
            className="relative group cursor-pointer"
            onClick={() => setShowAuthModal(true)}
            title="Click to upload profile photo or change settings"
          >
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
                src={player.customAvatarUrl || avatarUrl}
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
              <div>
                <h1 className="text-sm font-extrabold tracking-tight text-gradient-emerald truncate max-w-[135px]" title={player.username || player.name || "Adventurer"}>
                  ⚡ {player.username || player.name || "Adventurer"}
                </h1>
                <div className="text-[9px] text-slate-400 font-medium">
                  Focus Quest • Lvl {level}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Gold Valuation Pill - Click to Cash Out Gold via UPI */}
                <button
                  onClick={() => setShowUpiModal(true)}
                  className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 px-2 py-0.5 rounded-full border border-amber-500/40 transition-all cursor-pointer shadow-sm group"
                  title="Click to Sell Gold for Real Money via UPI"
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

                {/* Admin Portal Button strictly for verified Admin session */}
                {player.isAdmin && (player.email?.toLowerCase() === "vallapureddytharunreddy6281@gmail.com" || currentUser?.email?.toLowerCase() === "vallapureddytharunreddy6281@gmail.com") && (
                  <button
                    onClick={() => setShowAdminPortal(true)}
                    className="text-[11px] px-1.5 py-0.5 rounded font-bold bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-500/40 cursor-pointer shadow-sm"
                    title="Unlock Admin Control Panel"
                  >
                    👑 Admin
                  </button>
                )}
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

      {/* Cyber Tab Bar Navigation */}
      <nav className="flex bg-slate-900/90 border-b border-slate-800/80 backdrop-blur-md">
        {(
          [
            { id: "stats", label: "Shield", icon: "🛡️" },
            { id: "goals", label: "Quests", icon: "📜" },
            { id: "training", label: "Games", icon: "🧩" },
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

            {/* Real-Time UPI Payout Requests Status Tracker */}
            {upiPayoutRequests.length > 0 && (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-slate-900/80 glass-card space-y-2.5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-amber-300">
                    <span>💸 My UPI Payout Requests</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-400 text-[9px] border border-amber-800 font-mono">
                      {upiPayoutRequests.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowUpiModal(true)}
                    className="text-[10px] font-bold text-emerald-400 hover:underline cursor-pointer"
                  >
                    + Cash Out Gold
                  </button>
                </div>

                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {upiPayoutRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 glass-card"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5 font-bold font-mono">
                          <span className="text-amber-400 font-extrabold">🪙 {req.gold} Gold</span>
                          <span className="text-slate-500">➔</span>
                          <span className="text-emerald-400 font-extrabold">{req.inr}</span>
                        </div>
                        {renderPayoutStatusBadge(req.status)}
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-900">
                        <span>UPI ID: <strong className="text-slate-200">{req.upiId || player.upiId || authUpiId}</strong></span>
                        {req.createdAt && (
                          <span>{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : tab === "goals" ? (
          <section className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <span>📜</span> Quest Board
                </h2>
                <p className="text-[11px] text-slate-400">
                  Complete goals for +125 Gold, +25 HP & +25 XP
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {goals.length > 0 && (
                  <button
                    onClick={handleClearAllGoals}
                    className="px-2 py-1 text-xs font-bold rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition-all cursor-pointer"
                    title="Remove all active quests"
                  >
                    🧹 Clear All
                  </button>
                )}
                <button
                  onClick={() => setShowAddGoal(!showAddGoal)}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition-all shadow-md cursor-pointer"
                >
                  {showAddGoal ? "Cancel" : "+ New Quest"}
                </button>
              </div>
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
                <div>
                  <label className="text-[10px] font-semibold text-slate-300">
                    Required Time / Duration (Minutes):
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="480"
                    placeholder="Duration in Minutes (e.g. 30, 60, 120)"
                    value={newGoalMinutes}
                    onChange={(e) => setNewGoalMinutes(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500 mt-0.5"
                    required
                  />

                  {/* Mathematical Reward Scaling Preview */}
                  {(() => {
                    const previewMins = Math.max(5, parseInt(newGoalMinutes) || 30);
                    const rewards = calculateQuestRewards(previewMins);
                    return (
                      <div className="p-2 rounded-lg bg-slate-950/90 border border-emerald-500/30 flex justify-between items-center text-[10px] mt-1">
                        <span className="text-slate-400 font-medium">Scaled Rewards ({previewMins}m):</span>
                        <div className="flex items-center gap-2 font-bold font-mono">
                          <span className="text-emerald-400">+{rewards.hp} HP</span>
                          <span className="text-amber-400">+{rewards.gold} Gold</span>
                          <span className="text-purple-400">+{rewards.xp} XP</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
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
              {goals.length === 0 ? (
                <div className="p-6 rounded-xl border border-slate-800/80 bg-slate-900/40 text-center space-y-2">
                  <div className="text-3xl">📜</div>
                  <div className="text-xs font-bold text-slate-300">No Active Quests</div>
                  <p className="text-[11px] text-slate-400 max-w-[220px] mx-auto">
                    Click <strong className="text-emerald-400">+ New Quest</strong> above to create your personal daily or weekly focus goal!
                  </p>
                </div>
              ) : (
                goals.map((goal) => {
                const target = goal.targetMinutes || 30;
                const progress = goal.progressMinutes || 0;
                const percent = Math.min(100, Math.round((progress / target) * 100));
                const cardRewards = calculateQuestRewards(target);

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
                      <button
                        type="button"
                        onClick={() => handleToggleGoal(goal)}
                        className="mt-0.5 text-base select-none shrink-0 cursor-pointer hover:scale-110 active:scale-95 transition-transform bg-transparent border-0 p-0"
                        title={goal.isCompleted ? "Quest Completed & Claimed" : "Click to complete quest & claim rewards"}
                      >
                        {goal.isCompleted ? "✅" : "⏳"}
                      </button>
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
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDeleteGoal(goal.id);
                              }}
                              className="text-slate-400 hover:text-rose-400 p-0.5 text-[11px] font-bold cursor-pointer ml-1"
                              title="Delete Quest"
                            >
                              🗑️
                            </button>
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

                        <div className="flex items-center justify-between mt-2 text-[10px]">
                          <div className="flex items-center gap-2.5 font-bold font-mono">
                            <span className="text-emerald-400">+{cardRewards.hp} HP</span>
                            <span className="text-amber-400">+{cardRewards.gold} Gold</span>
                            <span className="text-purple-400">+{cardRewards.xp} XP</span>
                          </div>
                          <span className="text-slate-500 font-mono text-[9px]">({target}m time-scaled)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }))}
            </div>
          </section>
        ) : tab === "training" ? (
          <AiGamesModule player={player} onGainXp={handleGiveTrainingXp} />
        ) : tab === "bounties" ? (
          <section className="space-y-3">
            {/* Header & Sub-Nav Switcher */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <span>🎯</span> GitHub Bounties Hub
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Official Security Rewards & Funded Open-Source Issue Bounties
                  </p>
                </div>
              </div>

              {/* Sub-Category Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setBountyCategory("official")}
                  className={`py-1.5 px-2 rounded-lg font-bold transition-all text-center ${
                    bountyCategory === "official"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  🛡️ Official Bug Bounty
                </button>
                <button
                  onClick={() => {
                    setBountyCategory("opensource");
                    if (bounties.length === 0) loadBounties();
                  }}
                  className={`py-1.5 px-2 rounded-lg font-bold transition-all text-center ${
                    bountyCategory === "opensource"
                      ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 shadow"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  💸 Open Source Bounties
                </button>
              </div>
            </div>

            {/* View 1: Official GitHub Bug Bounty Program */}
            {bountyCategory === "official" ? (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {/* VIP & Public Tier Summary Card */}
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs space-y-1.5">
                  <div className="font-extrabold text-amber-300 flex items-center gap-1">
                    <span>👑 Official GitHub Bug Bounty Program</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-tight">
                    GitHub pays fixed public rewards from <strong>$250 to $10,000</strong>, plus an invite-only VIP tier paying up to <strong>$30,000+</strong> for security bug reports.
                  </p>
                </div>

                {/* Bounty Tier Payout Table Grid */}
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400">
                    Payout Rates by Vulnerability Severity
                  </div>

                  {/* Low Severity */}
                  <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-emerald-400 flex items-center gap-1">
                        <span>🟢 Low Severity</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Minor security disclosures</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-emerald-300">$250 <span className="text-[9px] text-slate-400 font-sans">(Public)</span></div>
                      <div className="text-[10px] text-amber-400 font-semibold">$1,000 <span className="text-[9px] text-slate-400 font-sans">(VIP)</span></div>
                    </div>
                  </div>

                  {/* Medium Severity */}
                  <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-cyan-400 flex items-center gap-1">
                        <span>🟡 Medium Severity</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Moderate impact vulnerabilities</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-cyan-300">$2,000 <span className="text-[9px] text-slate-400 font-sans">(Public)</span></div>
                      <div className="text-[10px] text-amber-400 font-semibold">$7,500 <span className="text-[9px] text-slate-400 font-sans">(VIP)</span></div>
                    </div>
                  </div>

                  {/* High Severity */}
                  <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-orange-400 flex items-center gap-1">
                        <span>🟠 High Severity</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Privilege escalation & RCE</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-orange-300">$5,000 <span className="text-[9px] text-slate-400 font-sans">(Public)</span></div>
                      <div className="text-[10px] text-amber-400 font-semibold">$20,000 <span className="text-[9px] text-slate-400 font-sans">(VIP)</span></div>
                    </div>
                  </div>

                  {/* Critical Severity */}
                  <div className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-950/20 flex justify-between items-center text-xs">
                    <div>
                      <div className="font-bold text-rose-400 flex items-center gap-1">
                        <span>🔴 Critical Severity</span>
                      </div>
                      <div className="text-[10px] text-slate-400">Full system exploit / data breach</div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold text-rose-300">$10,000 <span className="text-[9px] text-slate-400 font-sans">(Public)</span></div>
                      <div className="text-[10px] text-amber-300 font-extrabold">$30,000+ <span className="text-[9px] text-slate-400 font-sans">(VIP)</span></div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleViewIssue("https://bounty.github.com")}
                  className="w-full py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 cursor-pointer hover:opacity-95 transition-all shadow-md mt-1"
                >
                  Submit Bug Report to GitHub Security 🛡️
                </button>
              </div>
            ) : (
              /* View 2: Open Source Issue Bounties (Algora & BountyHub) */
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {/* Algora & BountyHub Rules Card */}
                <div className="p-3 rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-cyan-300 flex items-center gap-1">
                      <span>⚡ Algora & BountyHub Escrow Integrations</span>
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold border border-emerald-800">
                      Stripe Funded
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-tight">
                    Third-party platforms like <strong>Algora</strong> and <strong>BountyHub</strong> integrate directly with GitHub issues to let maintainers fund code fixes via Stripe.
                  </p>
                  <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-[10px] text-amber-300 font-mono">
                    🔒 Payout Rule: Funds are held in escrow & paid directly upon PR approval & merge by repo maintainers.
                  </div>
                </div>

                {/* Live Issues Header */}
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-300">Live Funded Issue Bounties</span>
                  <button
                    onClick={loadBounties}
                    className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-800 hover:bg-slate-700 text-emerald-400"
                  >
                    {bountiesLoading ? "Refreshing..." : "🔄 Refresh"}
                  </button>
                </div>

                <div className="space-y-2">
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
                      <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/60 text-[10px]">
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <span>💰 Escrow Funded PR</span>
                        </span>
                        <button
                          onClick={() => handleViewIssue(issue.html_url)}
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900 transition-all"
                        >
                          Solve & Submit PR ➔
                        </button>
                      </div>
                    </div>
                  ))}
                  {!bountiesLoading && bounties.length === 0 && (
                    <div className="text-center py-6 text-xs text-slate-500 space-y-2">
                      <p>No bounties loaded yet.</p>
                      <button
                        onClick={loadBounties}
                        className="px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 text-slate-950"
                      >
                        Load Live Bounties
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : null}
      </main>

      {/* User Profile & Firebase Cloud Sync Drawer Modal */}
      {showAuthModal && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 glass-card shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                <span>👤</span> Individual User Profile
              </h3>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-400">
                  Profile Account Details
                </div>
                <div className="space-y-2">
                  {/* Custom Profile Photo Upload */}
                  <div>
                    <div className="flex justify-between items-center text-[10px] font-semibold text-slate-300">
                      <span>Profile Photo:</span>
                      {player.customAvatarUrl && (
                        <button
                          type="button"
                          onClick={() => setPlayer((prev) => ({ ...prev, customAvatarUrl: "" }))}
                          className="text-[9px] text-rose-400 hover:underline cursor-pointer"
                        >
                          Reset to RPG Skin
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-10 h-10 rounded-lg overflow-hidden border border-slate-700 bg-slate-900 shrink-0">
                        <img
                          src={player.customAvatarUrl || avatarUrl}
                          alt="Avatar Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <label className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-300 font-semibold cursor-pointer hover:border-emerald-500 hover:text-emerald-400 text-center transition-all">
                        <span>📷 Choose Photo...</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const base64 = ev.target?.result as string;
                                if (base64) {
                                  setPlayer((prev) => ({ ...prev, customAvatarUrl: base64 }));
                                  triggerToast("📷 Profile photo uploaded!");
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-300">
                      Your Username:
                    </label>
                    <input
                      type="text"
                      value={player.username || player.name || ""}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setPlayer((prev) => ({ ...prev, username: newName, name: newName }));
                      }}
                      placeholder="Username (e.g. TharunReddy)"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-500 mt-0.5"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-300">
                      Mobile Number:
                    </label>
                    <input
                      type="tel"
                      value={player.mobileNumber || ""}
                      onChange={(e) => {
                        const newMobile = e.target.value;
                        setPlayer((prev) => ({ ...prev, mobileNumber: newMobile }));
                      }}
                      placeholder="e.g. 6281752093"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500 mt-0.5"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-300">
                      Personal UPI ID (For Gold Selling):
                    </label>
                    <input
                      type="text"
                      value={player.upiId || ""}
                      onChange={(e) => {
                        const newUpi = e.target.value;
                        setPlayer((prev) => ({ ...prev, upiId: newUpi }));
                      }}
                      placeholder="e.g. yourname@upi"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500 mt-0.5"
                    />
                  </div>
                </div>

                <button
                  onClick={async () => {
                    await persistPlayer(player);
                    setShowAuthModal(false);
                    triggerToast("✨ Profile Updated Successfully!");
                  }}
                  className="w-full py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 cursor-pointer transition-all mt-1"
                >
                  Save Profile Changes
                </button>
              </div>

              {/* Admin Portal Shortcut strictly for verified Admin session */}
              {player.isAdmin && (player.email?.toLowerCase() === "vallapureddytharunreddy6281@gmail.com" || currentUser?.email?.toLowerCase() === "vallapureddytharunreddy6281@gmail.com") && (
                <button
                  onClick={() => {
                    setShowAuthModal(false);
                    setShowAdminPortal(true);
                  }}
                  className="w-full py-2 text-xs font-extrabold rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 cursor-pointer shadow-lg hover:opacity-95 transition-all"
                >
                  👑 Open Admin Oversight Portal
                </button>
              )}

              {currentUser ? (
                <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex justify-between items-center text-xs">
                  <span className="text-slate-300 text-[11px]">
                    Cloud Sync: <strong className="text-emerald-400">{currentUser.email}</strong>
                  </span>
                  <button
                    onClick={async () => {
                      await signOut(auth);
                      setCurrentUser(null);
                      await persistPlayer({ ...player, isLoggedIn: false });
                      setShowAuthModal(false);
                      triggerToast("Signed out");
                    }}
                    className="px-2 py-1 text-[10px] font-bold rounded bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
                  >
                    Logout 🚪
                  </button>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    await persistPlayer({ ...player, isLoggedIn: false });
                    setShowAuthModal(false);
                    triggerToast("Signed out of session");
                  }}
                  className="w-full py-1.5 text-xs font-bold rounded-lg bg-rose-600/80 hover:bg-rose-600 text-slate-50 cursor-pointer"
                >
                  Logout 🚪
                </button>
              )}
            </div>
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

            {/* Payout Requests History with Real-Time Status Tracking */}
            {upiPayoutRequests.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>📋 Your UPI Request History ({upiPayoutRequests.length})</span>
                  <span className="text-[9px] text-emerald-400 font-mono">Live Cloud Sync</span>
                </div>
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {upiPayoutRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 glass-card"
                    >
                      <div className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-1.5 font-bold font-mono">
                          <span className="text-amber-400 font-extrabold">🪙 {req.gold} Gold</span>
                          <span className="text-slate-500">➔</span>
                          <span className="text-emerald-400 font-extrabold">{req.inr}</span>
                        </div>
                        {renderPayoutStatusBadge(req.status)}
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-900">
                        <span>UPI ID: <strong className="text-slate-200">{req.upiId || player.upiId || authUpiId}</strong></span>
                        {req.createdAt && (
                          <span>{new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Portal Drawer Modal */}
      {showAdminPortal && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-50 overflow-y-auto p-3">
          <AdminPortalModule onClose={() => setShowAdminPortal(false)} />
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


