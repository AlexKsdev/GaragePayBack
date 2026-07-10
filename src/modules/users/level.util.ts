const BASE_XP = 100;
const XP_STEP = 20;

/** XP required to advance from `level` (>= 1) to the next level. */
export function xpForLevel(level: number): number {
  return BASE_XP + XP_STEP * (level - 1);
}

export interface LevelInfo {
  level: number;
  /** XP earned within the current level (0 .. xpForNextLevel). */
  xpIntoLevel: number;
  /** XP needed to clear the current level. */
  xpForNextLevel: number;
  /** Percentage of the current level completed (0..100). */
  progressPct: number;
}

/** Derive level and in-level progress from a player's total lifetime XP. */
export function levelInfo(totalXp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));

  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }

  const xpForNextLevel = xpForLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel,
    progressPct: Math.round((remaining / xpForNextLevel) * 100),
  };
}

// Rewarded once per level gained.
export const COINS_PER_LEVEL = 200;
export const GEMS_PER_LEVEL = 2;

export interface LevelUpReward {
  levelsGained: number;
  coins: number;
  gems: number;
}

/** Reward earned for the levels crossed as XP rises from `oldXp` to `newXp`. */
export function levelUpReward(oldXp: number, newXp: number): LevelUpReward {
  const levelsGained = Math.max(
    0,
    levelInfo(newXp).level - levelInfo(oldXp).level,
  );
  return {
    levelsGained,
    coins: levelsGained * COINS_PER_LEVEL,
    gems: levelsGained * GEMS_PER_LEVEL,
  };
}
