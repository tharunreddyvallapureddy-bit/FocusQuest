// Focus Quest - Advanced Background Study & Auto-Goal Verification Engine (Manifest V3)
// Features:
// 1. Dynamic Whitelist & Blacklist domain evaluation from user storage.
// 2. Active Window & Idle Detection (prevents AFK study farming).
// 3. Real-time HP decay (-50 HP / 5 min on distraction) & Focus heal (+50 HP / 30 min on study).
// 4. AUTOMATIC BACKGROUND GOAL VERIFICATION: Accumulates verified study minutes, auto-ticks completed quest checkboxes, and awards +500 Gold!
// 5. Automatic DeclarativeNetRequest & Content Script Blocking when HP <= 0.

const DEFAULT_WHITELIST = [
  "github.com",
  "stackoverflow.com",
  "stackexchange.com",
  "canvas.instructure.com",
  "coursera.org",
  "udemy.com",
  "leetcode.com",
  "geeksforgeeks.org",
  "wikipedia.org",
  "arxiv.org",
  "medium.com",
  "docs.google.com",
];

const DEFAULT_BLACKLIST = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "tiktok.com",
  "netflix.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "twitch.tv",
  "facebook.com",
];

const DEFAULT_GOALS = [];

const BASE_MAX_HP = 300;

function getSiteCategory(url, whitelist, blacklist) {
  if (!url) return "neutral";
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (whitelist.some((domain) => hostname.includes(domain.toLowerCase()))) {
      return "educational";
    }
    if (blacklist.some((domain) => hostname.includes(domain.toLowerCase()))) {
      return "distracting";
    }
    return "neutral";
  } catch (e) {
    return "neutral";
  }
}

function initializeState() {
  chrome.storage.local.get(
    ["playerState", "goals", "whitelist", "blacklist"],
    (result) => {
      if (chrome.runtime.lastError) return;

      const initialPlayer = result.playerState || {
        hp: 300,
        maxHp: BASE_MAX_HP,
        coins: 0,
        intellectXp: 0,
        isDead: false,
        avatarSeed: "AdventurerHero",
        customAvatarUrl: "",
        focusMode: true,
      };

      const initialGoals = result.goals || DEFAULT_GOALS;
      const initialWhitelist = result.whitelist || DEFAULT_WHITELIST;
      
      // Ensure Youtube & YouTube Shorts are always present in Blacklist
      let initialBlacklist = result.blacklist || DEFAULT_BLACKLIST;
      if (!initialBlacklist.includes("youtube.com")) {
        initialBlacklist = Array.from(new Set([...initialBlacklist, ...DEFAULT_BLACKLIST]));
      }

      chrome.storage.local.set({
        playerState: initialPlayer,
        goals: initialGoals,
        whitelist: initialWhitelist,
        blacklist: initialBlacklist,
      });
    }
  );
}

// Track active tab category in real-time
async function evaluateActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.url) return;

    chrome.storage.local.get(
      ["whitelist", "blacklist"],
      ({ whitelist, blacklist }) => {
        const category = getSiteCategory(
          tab.url,
          whitelist || DEFAULT_WHITELIST,
          blacklist || DEFAULT_BLACKLIST
        );
        chrome.storage.local.set({
          activeDomain: new URL(tab.url).hostname,
          activeCategory: category,
          lastEvaluatedAt: Date.now(),
        });
      }
    );
  } catch (e) {
    // Ignore invalid tab urls
  }
}

// Listen to Tab & Window Events
chrome.tabs.onActivated.addListener(() => evaluateActiveTab());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") evaluateActiveTab();
});
chrome.windows.onFocusChanged.addListener(() => evaluateActiveTab());

// 1-Minute Verification Heartbeat
chrome.runtime.onInstalled.addListener(() => {
  initializeState();
  chrome.alarms.create("focusquest-heartbeat", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  initializeState();
  chrome.alarms.create("focusquest-heartbeat", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "focusquest-heartbeat") return;

  // Re-evaluate current active tab on every alarm tick
  await evaluateActiveTab();

  // Check Idle State (Pause if user is away/idle > 60s)
  chrome.idle.queryState(60, (idleState) => {
    if (idleState !== "active") {
      console.log("[Focus Quest] Student is IDLE. Pausing verification.");
      return;
    }

    chrome.storage.local.get(
      ["playerState", "goals", "activeCategory"],
      ({ playerState, goals, activeCategory }) => {
        if (!playerState) return;

        let { hp, maxHp, coins, intellectXp, isDead, focusMode } = playerState;
        maxHp = maxHp || BASE_MAX_HP;

        let currentGoals = goals || DEFAULT_GOALS;

        // Apply rules:
        // - Distracting (e.g. YouTube): -10 HP / min & -10 Coins / min (-50 HP & -50 Coins per 5 mins)
        // - Educational: +1.67 HP / min (+50 HP per 30 mins), +1 XP, +1.67 Gold
        if (activeCategory === "distracting" && focusMode) {
          hp = Math.max(0, hp - 10);
          coins = Math.max(0, coins - 10); // Deduct Coins alongside HP
          if (hp <= 0) {
            isDead = true;
          }
          console.log(`[Focus Quest] Distraction penalty applied (-10 HP/min, -10 Coins/min). HP now: ${hp.toFixed(1)}, Coins: ${coins.toFixed(1)}`);
        } else if (activeCategory === "educational") {
          hp = Math.min(maxHp, hp + 1.67);
          intellectXp += 1;
          coins += 1.67;
          if (hp > 0 && isDead) {
            isDead = false;
          }

          const todayStr = new Date().toISOString().split("T")[0];

          // 12:00 AM Midnight Expiration Pruning for Uncompleted Daily Quests
          currentGoals = currentGoals.filter((g) => {
            if (g.goalType === "daily") {
              const goalDate = g.createdDate || todayStr;
              if (goalDate < todayStr && !g.isCompleted) {
                console.log(`[Focus Quest] Daily quest expired at midnight (00:00): ${g.title}`);
                return false; // Remove expired daily quest (no rewards given)
              }
            }
            return true;
          });

          // AUTOMATIC BACKGROUND GOAL VERIFICATION & TICKING
          currentGoals = currentGoals.map((g) => {
            if (g.isCompleted) return g;

            const target = g.targetMinutes || 30;
            const nextProgress = (g.progressMinutes || 0) + 1;

            if (nextProgress >= target) {
              // Mathematical Reward Scaling Algorithm (Baseline 30m: +25 HP, +125 Gold, +25 XP)
              const ratio = Math.max(5, target) / 30;
              const rewardHp = Math.max(5, Math.round(25 * ratio));
              const rewardGold = Math.max(25, Math.round(125 * ratio));
              const rewardXp = Math.max(5, Math.round(25 * ratio));

              coins += rewardGold;
              hp = Math.min(maxHp, hp + rewardHp);
              intellectXp += rewardXp;

              // Send Chrome Notification for Auto-Verification
              if (chrome.notifications) {
                chrome.notifications.create({
                  type: "basic",
                  iconUrl: "icons/icon-48.png",
                  title: "🛡️ Quest Auto-Verified & Completed!",
                  message: `Quest "${g.title}" verified by background study tracking! +${rewardGold} Gold, +${rewardHp} HP & +${rewardXp} XP awarded (${target}m scaled).`,
                });
              }

              console.log(`[Focus Quest] Quest AUTO-VERIFIED & COMPLETED: ${g.title}`);
              return {
                ...g,
                progressMinutes: target,
                isCompleted: true,
                autoVerified: true,
              };
            }

            return {
              ...g,
              progressMinutes: nextProgress,
            };
          });

          console.log(`[Focus Quest] Study reward applied. HP: ${hp.toFixed(1)}, XP: ${intellectXp}`);
        }

        const updatedPlayer = {
          ...playerState,
          hp: Math.round(hp * 10) / 10,
          maxHp,
          coins: Math.round(coins * 10) / 10,
          intellectXp,
          isDead,
        };

        chrome.storage.local.set({
          playerState: updatedPlayer,
          goals: currentGoals,
        });
      }
    );
  });
});
