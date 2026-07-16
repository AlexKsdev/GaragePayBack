import { levelInfo, levelUpReward, xpForLevel } from './level.util';

describe('level.util', () => {
  describe('xpForLevel()', () => {
    it('starts at 100 and grows by 20 each level', () => {
      expect(xpForLevel(1)).toBe(100);
      expect(xpForLevel(2)).toBe(120);
      expect(xpForLevel(47)).toBe(1020);
    });
  });

  describe('levelInfo()', () => {
    it('treats a fresh player (0 xp) as level 1', () => {
      expect(levelInfo(0)).toEqual({
        level: 1,
        xpIntoLevel: 0,
        xpForNextLevel: 100,
        progressPct: 0,
      });
    });

    it('stays level 1 just below the threshold', () => {
      const info = levelInfo(99);
      expect(info.level).toBe(1);
      expect(info.xpIntoLevel).toBe(99);
      expect(info.progressPct).toBe(99);
    });

    it('advances to level 2 at exactly 100 xp', () => {
      expect(levelInfo(100)).toMatchObject({
        level: 2,
        xpIntoLevel: 0,
        xpForNextLevel: 120,
      });
    });

    it('carries the remainder into the new level', () => {
      expect(levelInfo(150)).toMatchObject({ level: 2, xpIntoLevel: 50 });
    });

    it('reaches level 47 at 25300 total xp', () => {
      expect(levelInfo(25300)).toMatchObject({ level: 47, xpIntoLevel: 0 });
      expect(levelInfo(25800)).toMatchObject({
        level: 47,
        xpIntoLevel: 500,
        xpForNextLevel: 1020,
      });
    });

    it('clamps negative xp to level 1', () => {
      expect(levelInfo(-50).level).toBe(1);
    });
  });

  describe('levelUpReward()', () => {
    it('gives 200 coins + 2 gems per level gained', () => {
      // 0 xp (L1) -> 100 xp (L2) = 1 level
      expect(levelUpReward(0, 100)).toEqual({
        levelsGained: 1,
        coins: 200,
        gems: 2,
      });
      // 0 xp (L1) -> 220 xp (L3) = 2 levels
      expect(levelUpReward(0, 220)).toEqual({
        levelsGained: 2,
        coins: 400,
        gems: 4,
      });
    });

    it('gives nothing when no level is crossed', () => {
      expect(levelUpReward(0, 50)).toEqual({
        levelsGained: 0,
        coins: 0,
        gems: 0,
      });
    });
  });
});
