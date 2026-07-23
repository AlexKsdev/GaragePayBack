/** The day the quest set turns over, and the clock the countdown runs on. */
export const QUEST_TIMEZONE = 'Europe/Kyiv';

/** Roughly what share of quests read as complete on any given day (0–100). */
export const QUEST_COMPLETION_PERCENT = 35;

/**
 * Icons an admin may pick for a quest. Stored by name; the client maps each to
 * its icon component. Constrained to a list so a typo can't render nothing —
 * the catalogue itself now lives in the database.
 */
export const QUEST_ICONS = [
  'Sword',
  'Pickaxe',
  'Users',
  'Calendar',
  'Box',
  'Hammer',
  'Footprints',
  'Fish',
  'PawPrint',
  'FlaskConical',
  'Sparkles',
  'Skull',
  'Wheat',
  'DoorOpen',
  'Target',
  'Trophy',
  'Gem',
  'Coins',
  'Flame',
  'Star',
] as const;

export type QuestIcon = (typeof QUEST_ICONS)[number];
