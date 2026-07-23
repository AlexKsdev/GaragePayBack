import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QuestsService } from './quests.service';
import { QUEST_ERROR_CODES } from '../../config/error-codes.config';

// Control the daily determinism so claim/list logic is testable in isolation.
jest.mock('./quest-day.util', () => ({
  questDay: () => '2026-07-18',
  nextReset: () => new Date('2026-07-19T00:00:00.000Z'),
  questProgress: jest.fn(),
}));
import { questProgress } from './quest-day.util';

const mockProgress = questProgress as jest.Mock;

const mockTx = {
  quest: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  questClaim: { create: jest.fn() },
  user: { update: jest.fn() },
  adminAction: { create: jest.fn() },
};

/** The row the service wrote to the audit log, or undefined if it wrote none. */
function auditRow(): Record<string, unknown> | undefined {
  const calls = mockTx.adminAction.create.mock.calls as [
    { data: Record<string, unknown> },
  ][];
  return calls.length ? calls[0][0].data : undefined;
}

const mockPrisma = {
  client: {
    quest: { findMany: jest.fn(), findUnique: jest.fn() },
    questClaim: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
};

mockPrisma.client.$transaction.mockImplementation((cb: unknown) =>
  (cb as (tx: unknown) => unknown)(mockTx),
);

const coinsQuest = {
  id: 'q1',
  key: 'kill_players',
  title: 'Kill 10 players',
  target: 10,
  rewardType: 'COINS' as const,
  rewardAmount: 500,
  icon: 'Sword',
  color: '#f87171',
  active: true,
  sortOrder: 1,
};
const gemsQuest = {
  ...coinsQuest,
  id: 'q2',
  key: 'trade_players',
  title: 'Trade with 3 players',
  target: 3,
  rewardType: 'GEMS' as const,
  rewardAmount: 5,
  sortOrder: 2,
};

describe('QuestsService', () => {
  let service: QuestsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestsService,
        { provide: PrismaService, useValue: mockPrisma },
        // The real thing over a mock: these tests should fail if a catalogue
        // change stops being recorded.
        AuditService,
      ],
    }).compile();
    service = module.get<QuestsService>(QuestsService);
    jest.clearAllMocks();
  });

  describe('list()', () => {
    it('reads the catalogue from the database and flags completed/claimed', async () => {
      mockProgress.mockImplementation((_u, _k, _d, target: number) => target);
      mockPrisma.client.quest.findMany.mockResolvedValue([
        coinsQuest,
        gemsQuest,
      ]);
      mockPrisma.client.questClaim.findMany.mockResolvedValue([
        { questKey: coinsQuest.key },
      ]);

      const result = await service.list('cuser1');

      // Only active quests belong to a player's day.
      expect(mockPrisma.client.quest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
      expect(result.resetAt).toBe('2026-07-19T00:00:00.000Z');
      expect(result.quests).toHaveLength(2);
      expect(result.quests[0]).toMatchObject({
        key: coinsQuest.key,
        title: coinsQuest.title,
        icon: 'Sword',
        color: '#f87171',
        completed: true,
        claimed: true,
        reward: { type: 'COINS', amount: 500 },
      });
      expect(result.quests[1].claimed).toBe(false);
    });
  });

  describe('claim()', () => {
    it('throws NotFound for an unknown quest', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue(null);
      await expect(service.claim('cuser1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a deactivated quest', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue({
        ...coinsQuest,
        active: false,
      });
      await expect(service.claim('cuser1', coinsQuest.key)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to claim a quest that is not complete', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue(coinsQuest);
      mockProgress.mockReturnValue(0);
      await expect(service.claim('cuser1', coinsQuest.key)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('credits coins and records the claim in one transaction', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue(coinsQuest);
      mockProgress.mockImplementation((_u, _k, _d, target: number) => target);
      mockTx.questClaim.create.mockResolvedValue({});
      mockTx.user.update.mockResolvedValue({ coins: 1500, gems: 20 });

      const result = await service.claim('cuser1', coinsQuest.key);

      expect(mockTx.questClaim.create).toHaveBeenCalledWith({
        data: { userId: 'cuser1', questKey: coinsQuest.key, day: '2026-07-18' },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const updateArg = mockTx.user.update.mock.calls[0][0] as {
        data: { coins?: { increment: number } };
      };
      expect(updateArg.data.coins).toEqual({ increment: 500 });
      expect(result).toEqual({
        coins: 1500,
        gems: 20,
        reward: { type: 'COINS', amount: 500 },
      });
    });

    it('credits gems for a gems quest', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue(gemsQuest);
      mockProgress.mockImplementation((_u, _k, _d, target: number) => target);
      mockTx.questClaim.create.mockResolvedValue({});
      mockTx.user.update.mockResolvedValue({ coins: 100, gems: 55 });

      await service.claim('cuser1', gemsQuest.key);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const updateArg = mockTx.user.update.mock.calls[0][0] as {
        data: { gems?: { increment: number } };
      };
      expect(updateArg.data.gems).toEqual({ increment: 5 });
    });

    it('maps the unique-violation race to an already-claimed error', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue(coinsQuest);
      mockProgress.mockImplementation((_u, _k, _d, target: number) => target);
      mockTx.questClaim.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dupe', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );

      const thrown = await service
        .claim('cuser1', coinsQuest.key)
        .catch((e: BadRequestException) => e);

      expect(thrown).toBeInstanceOf(BadRequestException);
      expect((thrown as BadRequestException).getResponse()).toMatchObject({
        code: QUEST_ERROR_CODES.alreadyClaimed,
      });
      expect(mockTx.user.update).not.toHaveBeenCalled();
    });
  });

  describe('admin catalogue', () => {
    const dto = {
      key: 'new_quest',
      title: 'Do a thing',
      target: 5,
      rewardType: 'GEMS' as const,
      rewardAmount: 3,
      icon: 'Star',
      color: '#ffffff',
    };

    it('rejects a duplicate key', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create(dto, 'cadmin')).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates a quest and audits it inside the same transaction', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue(null);
      mockTx.quest.create.mockResolvedValue({
        ...coinsQuest,
        ...dto,
        id: 'q9',
      });

      await service.create(dto, 'cadmin', '203.0.113.7');

      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.QUEST_CREATE,
        targetType: 'Quest',
        targetId: 'q9',
        ip: '203.0.113.7',
      });
    });

    // Fail-closed: an unrecordable catalogue change must not stand.
    it('rolls the create back when the audit write fails', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue(null);
      mockTx.quest.create.mockResolvedValue({ ...coinsQuest, id: 'q9' });
      mockTx.adminAction.create.mockRejectedValueOnce(new Error('log down'));

      await expect(service.create(dto, 'cadmin')).rejects.toThrow('log down');
    });

    it('records only the fields an update actually changed', async () => {
      mockPrisma.client.quest.findUnique.mockResolvedValue(coinsQuest);
      mockTx.quest.update.mockResolvedValue({
        ...coinsQuest,
        rewardAmount: 900,
      });

      await service.update('q1', { rewardAmount: 900 }, 'cadmin');

      expect(auditRow()).toMatchObject({
        action: AdminActionType.QUEST_UPDATE,
        metadata: { rewardAmount: { from: 500, to: 900 } },
      });
    });

    it('deactivates rather than deletes, and audits it as such', async () => {
      mockTx.quest.findUnique.mockResolvedValue({ id: 'q1' });
      mockTx.quest.update.mockResolvedValue({ ...coinsQuest, active: false });

      const result = await service.setActive('q1', false, 'cadmin');

      expect(result.active).toBe(false);
      expect(auditRow()).toMatchObject({
        action: AdminActionType.QUEST_DEACTIVATE,
        metadata: { key: coinsQuest.key, active: false },
      });
    });
  });
});
