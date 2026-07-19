import { QuestReward } from '../../../config/quests.config';

export class QuestDto {
  key: string;
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
