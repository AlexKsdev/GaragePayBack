import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { findQuest, QUESTS } from '../../config/quests.config';
import { QUEST_ERROR_CODES, questError } from '../../config/error-codes.config';
import { nextReset, questDay, questProgress } from './quest-day.util';
import {
  QuestClaimResponseDto,
  QuestListResponseDto,
} from './dto/quest-response.dto';

@Injectable()
export class QuestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<QuestListResponseDto> {
    const day = questDay();
    const claims = await this.prisma.client.questClaim.findMany({
      where: { userId, day },
      select: { questKey: true },
    });
    const claimed = new Set(claims.map((c) => c.questKey));

    const quests = QUESTS.map((q) => {
      const progress = questProgress(userId, q.key, day, q.target);
      return {
        key: q.key,
        target: q.target,
        progress,
        reward: q.reward,
        completed: progress >= q.target,
        claimed: claimed.has(q.key),
      };
    });
    return { quests, resetAt: nextReset().toISOString() };
  }

  async claim(userId: string, key: string): Promise<QuestClaimResponseDto> {
    const quest = findQuest(key);
    if (!quest) {
      throw new NotFoundException(
        questError(QUEST_ERROR_CODES.notFound, 'Quest not found'),
      );
    }
    const day = questDay();
    if (questProgress(userId, key, day, quest.target) < quest.target) {
      throw new BadRequestException(
        questError(QUEST_ERROR_CODES.notComplete, 'Quest not complete'),
      );
    }

    try {
      // The unique (userId, questKey, day) row is the guard against a double
      // claim; inserting it and crediting the reward in one transaction keeps
      // them atomic, so a failed credit can't leave a claim behind (or vice versa).
      return await this.prisma.client.$transaction(async (tx) => {
        await tx.questClaim.create({ data: { userId, questKey: key, day } });
        const user = await tx.user.update({
          where: { id: userId },
          data:
            quest.reward.type === 'GEMS'
              ? { gems: { increment: quest.reward.amount } }
              : { coins: { increment: quest.reward.amount } },
          select: { coins: true, gems: true },
        });
        return { coins: user.coins, gems: user.gems, reward: quest.reward };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          questError(
            QUEST_ERROR_CODES.alreadyClaimed,
            'Reward already claimed',
          ),
        );
      }
      throw e;
    }
  }
}
