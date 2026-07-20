import { createHash } from 'crypto';
import {
  QUEST_COMPLETION_PERCENT,
  QUEST_TIMEZONE,
} from '../../config/quests.config';

/** Wall-clock parts of `now` in the quest timezone. */
function localParts(now: Date): {
  date: string;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: QUEST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24, // some engines emit '24' at midnight
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** 'YYYY-MM-DD' for the current day in the quest timezone. */
export function questDay(now: Date = new Date()): string {
  return localParts(now).date;
}

/** The instant of the next local midnight — when the quest set turns over. */
export function nextReset(now: Date = new Date()): Date {
  const { hour, minute, second } = localParts(now);
  const secondsLeft = (24 - hour) * 3600 - minute * 60 - second;
  return new Date(now.getTime() + secondsLeft * 1000);
}

/**
 * Deterministic daily progress: the same (user, quest, day) always yields the
 * same value, so a reload is stable and midnight rolls a fresh set — no stored
 * progress and no cron. A share of quests read as complete; the rest sit at a
 * stable partial value.
 */
export function questProgress(
  userId: string,
  questKey: string,
  day: string,
  target: number,
): number {
  const hash = createHash('sha256')
    .update(`${userId}:${questKey}:${day}`)
    .digest();
  if (hash.readUInt16BE(0) % 100 < QUEST_COMPLETION_PERCENT) return target;
  return hash.readUInt32BE(2) % target; // 0 .. target-1
}
