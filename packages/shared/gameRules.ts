// Shared game rules for Focus Quest
// This file will be imported by both the Chrome extension and mobile app.

export type SiteCategory = "productive" | "distracting";

export const WHITELISTED_SITES: string[] = [
  "github.com",
  "stackoverflow.com",
  "stackexchange.com",
  "canvas.",
];

export const BLACKLISTED_SITES: string[] = [
  "instagram.com",
  "netflix.com",
  "tiktok.com",
  "reddit.com",
];

export const HP_CHANGE_PER_MINUTE = {
  productive: +1,
  distracting: -5,
} as const;

export function getSiteCategoryFromUrl(url: string): SiteCategory | null {
  try {
    const hostname = new URL(url).hostname;
    if (WHITELISTED_SITES.some((domain) => hostname.includes(domain))) {
      return "productive";
    }
    if (BLACKLISTED_SITES.some((domain) => hostname.includes(domain))) {
      return "distracting";
    }
    return null;
  } catch {
    return null;
  }
}

