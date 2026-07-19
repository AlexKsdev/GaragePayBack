export type QuestRewardType = 'COINS' | 'GEMS';

export interface QuestReward {
  type: QuestRewardType;
  amount: number;
}

export interface QuestDef {
  /** Stable id: the frontend maps it to an icon, colour and localized title. */
  key: string;
  target: number;
  reward: QuestReward;
}

/** The day the quest set turns over, and the clock the countdown runs on. */
export const QUEST_TIMEZONE = 'Europe/Kyiv';

/** Roughly what share of quests read as complete on any given day (0–100). */
export const QUEST_COMPLETION_PERCENT = 35;

/**
 * The daily catalogue. Titles live in the frontend i18n keyed by `key`; only
 * the mechanics (target + reward) are here. Rewards are coins or gems — the
 * only real balances — so every claim actually credits the account.
 */
export const QUESTS: QuestDef[] = [
  { key: 'kill_players', target: 10, reward: { type: 'COINS', amount: 500 } },
  { key: 'mine_ores', target: 200, reward: { type: 'COINS', amount: 300 } },
  { key: 'trade_players', target: 3, reward: { type: 'GEMS', amount: 5 } },
  { key: 'login_streak', target: 7, reward: { type: 'GEMS', amount: 10 } },
  { key: 'place_blocks', target: 500, reward: { type: 'COINS', amount: 250 } },
  { key: 'craft_items', target: 25, reward: { type: 'COINS', amount: 200 } },
  {
    key: 'travel_blocks',
    target: 1000,
    reward: { type: 'COINS', amount: 150 },
  },
  { key: 'fish_catch', target: 15, reward: { type: 'COINS', amount: 180 } },
  { key: 'tame_animals', target: 3, reward: { type: 'GEMS', amount: 4 } },
  { key: 'brew_potions', target: 5, reward: { type: 'GEMS', amount: 6 } },
  { key: 'enchant_gear', target: 4, reward: { type: 'GEMS', amount: 8 } },
  { key: 'defeat_boss', target: 1, reward: { type: 'GEMS', amount: 15 } },
  { key: 'harvest_crops', target: 64, reward: { type: 'COINS', amount: 220 } },
  { key: 'complete_dungeon', target: 2, reward: { type: 'GEMS', amount: 12 } },
];

export function findQuest(key: string): QuestDef | undefined {
  return QUESTS.find((q) => q.key === key);
}
