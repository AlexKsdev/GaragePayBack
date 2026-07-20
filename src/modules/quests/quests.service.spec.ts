import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { QuestsService } from './quests.service';
import { QUESTS } from '../../config/quests.config';
import { QUEST_ERROR_CODES } from '../../config/error-codes.config';

// Control the daily determinism so claim/list logic is testable in isolation.
jest.mock('./quest-day.util', () => ({
  questDay: () => '2026-07-18',
  nextReset: () => new Date('2026-07-19T00:00:00.000Z'),
  questProgress: jest.fn(),
}));
import { questProgress } from './quest-day.util';

const mockProgress = questProgress as jest.Mock;

const mockPrisma = {
  client: {
    questClaim: { findMany: jest.fn(), create: jest.fn() },
    user: { update: jest.fn() },
    $transaction: jest.fn(),
  },
};

mockPrisma.client.$transaction.mockImplementation((cb: unknown) =>
  (cb as (tx: unknown) => unknown)(mockPrisma.client),
);

const COINS_QUEST = QUESTS.find((q) => q.reward.type === 'COINS')!;
const GEMS_QUEST = QUESTS.find((q) => q.reward.type === 'GEMS')!;

describe('QuestsService', () => {
  let service: QuestsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<QuestsService>(QuestsService);
    jest.clearAllMocks();
  });

  describe('list()', () => {
    it('flags completed and claimed quests and returns the reset instant', async () => {
      // Every quest complete, so `completed` is purely progress-driven.
      mockProgress.mockImplementation((_u, _k, _d, target: number) => target);
      mockPrisma.client.questClaim.findMany.mockResolvedValue([
        { questKey: COINS_QUEST.key },
      ]);

      const result = await service.list('cuser1');

      expect(result.resetAt).toBe('2026-07-19T00:00:00.000Z');
      expect(result.quests).toHaveLength(QUESTS.length);
      const coinsView = result.quests.find((q) => q.key === COINS_QUEST.key)!;
      expect(coinsView.completed).toBe(true);
      expect(coinsView.claimed).toBe(true); // it was in the claims list
      const otherView = result.quests.find((q) => q.key === GEMS_QUEST.key)!;
      expect(otherView.claimed).toBe(false);
    });
  });

  describe('claim()', () => {
    it('throws NotFound for an unknown quest', async () => {
      await expect(service.claim('cuser1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses to claim a quest that is not complete', async () => {
      mockProgress.mockReturnValue(0); // below any target
      await expect(service.claim('cuser1', COINS_QUEST.key)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('credits coins and records the claim in one transaction', async () => {
      mockProgress.mockImplementation((_u, _k, _d, target: number) => target);
      mockPrisma.client.questClaim.create.mockResolvedValue({});
      mockPrisma.client.user.update.mockResolvedValue({
        coins: 1500,
        gems: 20,
      });

      const result = await service.claim('cuser1', COINS_QUEST.key);

      expect(mockPrisma.client.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.client.questClaim.create).toHaveBeenCalledWith({
        data: {
          userId: 'cuser1',
          questKey: COINS_QUEST.key,
          day: '2026-07-18',
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const updateArg = mockPrisma.client.user.update.mock.calls[0][0] as {
        data: { coins?: { increment: number }; gems?: { increment: number } };
      };
      expect(updateArg.data.coins).toEqual({
        increment: COINS_QUEST.reward.amount,
      });
      expect(result).toEqual({
        coins: 1500,
        gems: 20,
        reward: COINS_QUEST.reward,
      });
    });

    it('credits gems for a gems quest', async () => {
      mockProgress.mockImplementation((_u, _k, _d, target: number) => target);
      mockPrisma.client.questClaim.create.mockResolvedValue({});
      mockPrisma.client.user.update.mockResolvedValue({ coins: 100, gems: 55 });

      await service.claim('cuser1', GEMS_QUEST.key);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const updateArg = mockPrisma.client.user.update.mock.calls[0][0] as {
        data: { gems?: { increment: number } };
      };
      expect(updateArg.data.gems).toEqual({
        increment: GEMS_QUEST.reward.amount,
      });
    });

    it('maps the unique-violation race to an already-claimed error', async () => {
      mockProgress.mockImplementation((_u, _k, _d, target: number) => target);
      mockPrisma.client.questClaim.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dupe', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );

      const thrown = await service
        .claim('cuser1', COINS_QUEST.key)
        .catch((e: BadRequestException) => e);

      expect(thrown).toBeInstanceOf(BadRequestException);
      expect((thrown as BadRequestException).getResponse()).toMatchObject({
        code: QUEST_ERROR_CODES.alreadyClaimed,
      });
      expect(mockPrisma.client.user.update).not.toHaveBeenCalled();
    });
  });
});
