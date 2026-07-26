// Focus Quest - Background Service Worker (Manifest V3)
// Core loop:
// - Productive sites slowly heal HP (+1 per minute)
// - Distracting sites slowly damage HP (-5 per minute)
// We track the last site category and apply changes every minute.

const PRODUCTIVE_SITES = [
  "github.com",
  "stackoverflow.com",
  "stackexchange.com",
  "canvas.",
];
const DISTRACTING_SITES = [
  "instagram.com",
  "netflix.com",
  "tiktok.com",
  "reddit.com",
];

const HP_PER_MINUTE = {
  productive: 1,
  distracting: -5,
};

function getCategoryFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    if (PRODUCTIVE_SITES.some((domain) => hostname.includes(domain)))
      return "productive";
    if (DISTRACTING_SITES.some((domain) => hostname.includes(domain)))
      return "distracting";
    return null;
  } catch (e) {
    return null;
  }
}

function ensureInitialState() {
  chrome.storage.local.get(["playerState"], (result) => {
    if (chrome.runtime.lastError) return;

    if (!result.playerState) {
      const initial = {
        hp: 100,
        maxHp: 100,
        coins: 0,
        level: 1,
        intellectXp: 0,
        isDead: false,
      };
      chrome.storage.local.set({ playerState: initial });
    }
  });
}

// Track last category from tab changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url) return;
  if (changeInfo.status !== "complete") return;

  const category = getCategoryFromUrl(tab.url);
  if (!category) return;

  chrome.storage.local.set(
    {
      lastSiteCategory: category,
      lastCategoryTimestamp: Date.now(),
    },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Focus Quest] storage error:",
          chrome.runtime.lastError
        );
      }
    }
  );
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab?.url) return;
    const category = getCategoryFromUrl(tab.url);
    if (!category) return;
    chrome.storage.local.set({
      lastSiteCategory: category,
      lastCategoryTimestamp: Date.now(),
    });
  });
});

// Alarm tick every minute
chrome.runtime.onInstalled.addListener(() => {
  ensureInitialState();
  chrome.alarms.create("focusquest-tick", { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  ensureInitialState();
  chrome.alarms.create("focusquest-tick", { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "focusquest-tick") return;

  chrome.storage.local.get(
    ["playerState", "lastSiteCategory"],
    (result) => {
      if (chrome.runtime.lastError) return;

      const player =
        result.playerState || {
          hp: 100,
          maxHp: 100,
          coins: 0,
          level: 1,
          intellectXp: 0,
          isDead: false,
        };
      const category = result.lastSiteCategory;

      if (!category || !HP_PER_MINUTE[category]) return;

      let hp = player.hp + HP_PER_MINUTE[category];
      const maxHp = player.maxHp || 100;
      if (hp > maxHp) hp = maxHp;
      if (hp < 0) hp = 0;

      const isDead = hp <= 0;

      const updated = {
        ...player,
        hp,
        maxHp,
        isDead,
      };

      chrome.storage.local.set({ playerState: updated }, () => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[Focus Quest] failed to update player state:",
            chrome.runtime.lastError
          );
        } else {
          console.log(
            "[Focus Quest] tick",
            category,
            "HP now",
            updated.hp,
            "isDead",
            updated.isDead
          );
        }
      });
    }
  );
});

