import { QuestRewardType } from '@prisma/client';

export class QuestReward {
  type: QuestRewardType;
  amount: number;
}

export class QuestDto {
  key: string;
  /** Base title; the client localizes built-in keys and falls back to this. */
  title: string;
  icon: string;
  color: string;
  target: number;
  progress: number;
  reward: QuestReward;
  completed: boolean;
  /** Whether today's reward has already been taken. */
  claimed: boolean;
}

export class QuestListResponseDto {
  quests: QuestDto[];
  /** ISO instant of the next reset (local midnight) — the client counts to it. */
  resetAt: string;
}

/** Fresh balances after a claim, plus the reward granted, for an instant UI bump. */
export class QuestClaimResponseDto {
  coins: number;
  gems: number;
  reward: QuestReward;
}

/** The full row an admin manages, including inactive quests. */
export class AdminQuestDto {
  id: string;
  key: string;
  title: string;
  target: number;
  rewardType: QuestRewardType;
  rewardAmount: number;
  icon: string;
  color: string;
  active: boolean;
  sortOrder: number;
}
