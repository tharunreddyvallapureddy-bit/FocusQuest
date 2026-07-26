// Game Logic & Physics Mechanics for Focus Quest

export const BASE_MAX_HP = 300;
export const INR_PER_100_GOLD = 0.5;

/**
 * Quadratic Level progression curve: Level = floor(0.05 * sqrt(XP)) + 1
 */
export function calculateLevel(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(0.05 * Math.sqrt(xp)) + 1;
}

/**
 * Calculates HP loss based on distraction time (-50 HP per 5 minutes / 300s)
 */
export function calculateHpDecay(distractionSeconds: number): number {
  const intervals = Math.floor(distractionSeconds / 300);
  return intervals * 50;
}

/**
 * Calculates HP gain based on focus time (+50 HP per 30 minutes / 1800s)
 */
export function calculateHpGain(educationalSeconds: number): number {
  const intervals = Math.floor(educationalSeconds / 1800);
  return intervals * 50;
}

/**
 * Converts Gold currency to approximate INR real-world valuation (100 Gold = 0.5 INR)
 */
export function goldToINR(gold: number): string {
  const value = (gold / 100) * INR_PER_100_GOLD;
  return `₹${value.toFixed(2)}`;
}

/**
 * Generates DiceBear Adventurer Avatar SVG URL using seed
 */
export function getDiceBearAvatar(seed: string): string {
  const safeSeed = encodeURIComponent(seed || "hero");
  return `https://api.dicebear.com/7.x/adventurer/svg?seed=${safeSeed}`;
}
