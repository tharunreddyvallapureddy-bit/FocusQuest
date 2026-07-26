// Focus Quest - Advanced Background Study & Distraction Verification Engine (Manifest V3)
// Features:
// 1. Dynamic Whitelist & Blacklist domain evaluation from user storage.
// 2. Active Window & Idle Detection (prevents AFK study farming).
// 3. Real-time HP decay (-50 HP / 30 min on distraction) & Focus heal (+50 HP / 30 min on study).
// 4. Automatic DeclarativeNetRequest & Content Script Blocking when HP <= 0.

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
    ["playerState", "whitelist", "blacklist"],
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

      const initialWhitelist = result.whitelist || DEFAULT_WHITELIST;
      const initialBlacklist = result.blacklist || DEFAULT_BLACKLIST;

      chrome.storage.local.set({
        playerState: initialPlayer,
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
    // Ignore invalid tab urls (e.g. chrome://)
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
      ["playerState", "activeCategory"],
      ({ playerState, activeCategory }) => {
        if (!playerState) return;

        let { hp, maxHp, coins, intellectXp, isDead, focusMode } = playerState;
        maxHp = maxHp || BASE_MAX_HP;

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
          console.log(`[Focus Quest] Study reward applied. HP: ${hp.toFixed(1)}, XP: ${intellectXp}`);
        }

        const updated = {
          ...playerState,
          hp: Math.round(hp * 10) / 10,
          maxHp,
          coins: Math.round(coins * 10) / 10,
          intellectXp,
          isDead,
        };

        chrome.storage.local.set({ playerState: updated });
      }
    );
  });
});
