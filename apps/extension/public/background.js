// Focus Quest - Advanced Background Study & Auto-Goal Verification Engine (Manifest V3)
// Features:
// 1. Dynamic Whitelist & Blacklist domain evaluation from user storage.
// 2. Active Window & Idle Detection (prevents AFK study farming).
// 3. Real-time HP decay (-50 HP / 30 min on distraction) & Focus heal (+50 HP / 30 min on study).
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
  "instagram.com",
  "tiktok.com",
  "netflix.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "twitch.tv",
  "facebook.com",
];

const DEFAULT_GOALS = [
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
        coins: 100,
        intellectXp: 0,
        isDead: false,
        avatarSeed: "AdventurerHero",
        focusMode: true,
      };

      const initialGoals = result.goals || DEFAULT_GOALS;
      const initialWhitelist = result.whitelist || DEFAULT_WHITELIST;
      const initialBlacklist = result.blacklist || DEFAULT_BLACKLIST;

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
        let stateChanged = false;

        // Apply rules:
        // - Distracting: -1.67 HP / min (-50 HP per 30 mins)
        // - Educational: +1.67 HP / min (+50 HP per 30 mins), +1 XP, +1.67 Gold
        if (activeCategory === "distracting" && focusMode) {
          hp = Math.max(0, hp - 1.67);
          if (hp <= 0) {
            isDead = true;
          }
          console.log(`[Focus Quest] Distraction penalty applied. HP: ${hp.toFixed(1)}`);
        } else if (activeCategory === "educational") {
          hp = Math.min(maxHp, hp + 1.67);
          intellectXp += 1;
          coins += 1.67;
          if (hp > 0 && isDead) {
            isDead = false;
          }

          // AUTOMATIC BACKGROUND GOAL VERIFICATION & TICKING
          currentGoals = currentGoals.map((g) => {
            if (g.isCompleted) return g;

            const target = g.targetMinutes || 30;
            const nextProgress = (g.progressMinutes || 0) + 1;

            if (nextProgress >= target) {
              stateChanged = true;
              coins += 500; // Award 500 Gold per completed goal
              hp = Math.min(maxHp, hp + 50);
              intellectXp += 50;

              // Send Chrome Notification for Auto-Verification
              if (chrome.notifications) {
                chrome.notifications.create({
                  type: "basic",
                  iconUrl: "icons/icon48.png",
                  title: "🛡️ Quest Auto-Verified & Completed!",
                  message: `Quest "${g.title}" was verified by background study tracking! +500 Gold awarded.`,
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
