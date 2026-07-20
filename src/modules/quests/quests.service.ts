import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { QUEST_ERROR_CODES, questError } from '../../config/error-codes.config';
import { AuditService } from '../audit/audit.service';
import { nextReset, questDay, questProgress } from './quest-day.util';
import {
  AdminQuestDto,
  QuestClaimResponseDto,
  QuestListResponseDto,
} from './dto/quest-response.dto';
import { CreateQuestDto, UpdateQuestDto } from './dto/upsert-quest.dto';

const ADMIN_QUEST_SELECT = {
  id: true,
  key: true,
  title: true,
  target: true,
  rewardType: true,
  rewardAmount: true,
  icon: true,
  color: true,
  active: true,
  sortOrder: true,
} as const;

@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Today's set for a player: active quests only, with progress and claims. */
  async list(userId: string): Promise<QuestListResponseDto> {
    const day = questDay();
    const [defs, claims] = await Promise.all([
      this.prisma.client.quest.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
        select: ADMIN_QUEST_SELECT,
      }),
      this.prisma.client.questClaim.findMany({
        where: { userId, day },
        select: { questKey: true },
      }),
    ]);
    const claimed = new Set(claims.map((c) => c.questKey));

    const quests = defs.map((q) => {
      const progress = questProgress(userId, q.key, day, q.target);
      return {
        key: q.key,
        title: q.title,
        icon: q.icon,
        color: q.color,
        target: q.target,
        progress,
        reward: { type: q.rewardType, amount: q.rewardAmount },
        completed: progress >= q.target,
        claimed: claimed.has(q.key),
      };
    });
    return { quests, resetAt: nextReset().toISOString() };
  }

  async claim(userId: string, key: string): Promise<QuestClaimResponseDto> {
    const quest = await this.prisma.client.quest.findUnique({
      where: { key },
      select: ADMIN_QUEST_SELECT,
    });
    // An inactive quest is not part of today's set, so it cannot be claimed.
    if (!quest || !quest.active) {
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
            quest.rewardType === 'GEMS'
              ? { gems: { increment: quest.rewardAmount } }
              : { coins: { increment: quest.rewardAmount } },
          select: { coins: true, gems: true },
        });
        return {
          coins: user.coins,
          gems: user.gems,
          reward: { type: quest.rewardType, amount: quest.rewardAmount },
        };
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

  /* ── Admin catalogue management ── */

  /** Every quest, including inactive ones. */
  listAll(): Promise<AdminQuestDto[]> {
    return this.prisma.client.quest.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: ADMIN_QUEST_SELECT,
    });
  }

  async create(
    dto: CreateQuestDto,
    actorId: string,
    ip?: string,
  ): Promise<AdminQuestDto> {
    const clash = await this.prisma.client.quest.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Quest key already in use');

    // One transaction: a catalogue change that cannot be recorded must not stand.
    return this.prisma.client.$transaction(async (tx) => {
      const quest = await tx.quest.create({
        data: dto,
        select: ADMIN_QUEST_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.QUEST_CREATE,
          targetType: 'Quest',
          targetId: quest.id,
          metadata: {
            key: quest.key,
            target: quest.target,
            rewardType: quest.rewardType,
            rewardAmount: quest.rewardAmount,
          },
          ip,
        },
        tx,
      );
      return quest;
    });
  }

  async update(
    id: string,
    dto: UpdateQuestDto,
    actorId: string,
    ip?: string,
  ): Promise<AdminQuestDto> {
    const existing = await this.prisma.client.quest.findUnique({
      where: { id },
      select: ADMIN_QUEST_SELECT,
    });
    if (!existing) {
      throw new NotFoundException(
        questError(QUEST_ERROR_CODES.notFound, 'Quest not found'),
      );
    }
    if (dto.key && dto.key !== existing.key) {
      const clash = await this.prisma.client.quest.findUnique({
        where: { key: dto.key },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Quest key already in use');
    }

    // Only the fields that actually moved, so an incident review reads cleanly.
    const changed = Object.entries(dto)
      .filter(
        ([field, value]) =>
          value !== undefined &&
          value !== (existing as unknown as Record<string, unknown>)[field],
      )
      .map(([field]) => field);

    return this.prisma.client.$transaction(async (tx) => {
      const quest = await tx.quest.update({
        where: { id },
        data: dto,
        select: ADMIN_QUEST_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.QUEST_UPDATE,
          targetType: 'Quest',
          targetId: id,
          metadata: {
            key: existing.key,
            changed,
            // The reward hands out currency, so its before/after is spelled out
            // rather than left for someone to reconstruct.
            ...(dto.rewardAmount !== undefined
              ? {
                  rewardAmount: {
                    from: existing.rewardAmount,
                    to: dto.rewardAmount,
                  },
                }
              : {}),
            ...(dto.rewardType !== undefined
              ? {
                  rewardType: { from: existing.rewardType, to: dto.rewardType },
                }
              : {}),
          },
          ip,
        },
        tx,
      );
      return quest;
    });
  }

  /** Removal from the daily set is reversible — claims keep meaning something. */
  setActive(
    id: string,
    active: boolean,
    actorId: string,
    ip?: string,
  ): Promise<AdminQuestDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const found = await tx.quest.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!found) {
        throw new NotFoundException(
          questError(QUEST_ERROR_CODES.notFound, 'Quest not found'),
        );
      }
      const quest = await tx.quest.update({
        where: { id },
        data: { active },
        select: ADMIN_QUEST_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: active
            ? AdminActionType.QUEST_UPDATE
            : AdminActionType.QUEST_DEACTIVATE,
          targetType: 'Quest',
          targetId: id,
          metadata: { key: quest.key, active },
          ip,
        },
        tx,
      );
      return quest;
    });
  }
}
