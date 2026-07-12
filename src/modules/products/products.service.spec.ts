import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from './products.service';
import { ProductSort } from './dto/query-products.dto';

const mockTx = {
  user: { updateMany: jest.fn(), findUnique: jest.fn() },
  purchase: { create: jest.fn() },
};

const mockPrisma = {
  client: {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    // Interactive transaction: run the callback against the tx mock.
    $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  },
};

const coinProduct = {
  id: 'cprod1',
  slug: 'diamond-sword',
  name: 'Diamond Sword',
  emoji: '⚔️',
  currency: Currency.COINS,
  price: 1200,
  active: true,
};

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll()', () => {
    it('returns a paginated envelope of active, category-filtered products', async () => {
      mockPrisma.client.product.findMany.mockResolvedValue([coinProduct]);
      mockPrisma.client.product.count.mockResolvedValue(7);
      const result = await service.findAll({
        category: 'Weapons',
        page: 2,
        limit: 6,
        skip: 6,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const call = mockPrisma.client.product.findMany.mock.calls[0][0] as {
        where: { active: boolean; category?: string };
        skip: number;
        take: number;
      };
      expect(call.where.active).toBe(true);
      expect(call.where.category).toBe('Weapons');
      expect(call.skip).toBe(6);
      expect(call.take).toBe(6);
      expect(result).toEqual({
        items: [coinProduct],
        total: 7,
        page: 2,
        limit: 6,
      });
    });

    it('omits the category filter and defaults order when none is given', async () => {
      mockPrisma.client.product.findMany.mockResolvedValue([]);
      mockPrisma.client.product.count.mockResolvedValue(0);
      await service.findAll({ skip: 0, limit: 20 });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const call = mockPrisma.client.product.findMany.mock.calls[0][0] as {
        where: { category?: string };
        orderBy: { createdAt?: string };
      };
      expect(call.where.category).toBeUndefined();
      expect(call.orderBy.createdAt).toBe('asc');
    });

    it('maps the rarity sort to the matching orderBy', async () => {
      mockPrisma.client.product.findMany.mockResolvedValue([]);
      mockPrisma.client.product.count.mockResolvedValue(0);
      await service.findAll({
        sort: ProductSort.RARITY_DESC,
        skip: 0,
        limit: 6,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const call = mockPrisma.client.product.findMany.mock.calls[0][0] as {
        orderBy: { rarityRank?: string };
      };
      expect(call.orderBy.rarityRank).toBe('desc');
    });

    it('sorts price within a currency group (coins lead, then price)', async () => {
      mockPrisma.client.product.findMany.mockResolvedValue([]);
      mockPrisma.client.product.count.mockResolvedValue(0);
      await service.findAll({
        sort: ProductSort.COINS_ASC,
        skip: 0,
        limit: 6,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const call = mockPrisma.client.product.findMany.mock.calls[0][0] as {
        orderBy: { currency?: string; price?: string }[];
      };
      expect(call.orderBy).toEqual([{ currency: 'asc' }, { price: 'asc' }]);
    });
  });

  describe('findOne()', () => {
    it('throws NotFoundException for an unknown slug', async () => {
      mockPrisma.client.product.findFirst.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('purchase()', () => {
    it('throws NotFoundException when the product is missing', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue(null);
      await expect(service.purchase('cuser1', 'cprod1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the product is inactive', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
        active: false,
      });
      await expect(service.purchase('cuser1', 'cprod1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the balance is too low', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
      });
      mockTx.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.purchase('cuser1', 'cprod1')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockTx.purchase.create).not.toHaveBeenCalled();
    });

    it('decrements the matching currency and records the purchase', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
      });
      mockTx.user.updateMany.mockResolvedValue({ count: 1 });
      mockTx.purchase.create.mockResolvedValue({
        id: 'cpurch1',
        currency: Currency.COINS,
        price: 1200,
        createdAt: new Date(),
        product: coinProduct,
      });
      mockTx.user.findUnique.mockResolvedValue({ coins: 3620, gems: 38 });

      const result = await service.purchase('cuser1', 'cprod1');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const updateArg = mockTx.user.updateMany.mock.calls[0][0] as {
        where: { coins?: { gte: number }; gems?: { gte: number } };
        data: { coins?: { decrement: number }; gems?: { decrement: number } };
      };
      expect(updateArg.where.coins).toEqual({ gte: 1200 });
      expect(updateArg.data.coins).toEqual({ decrement: 1200 });
      expect(result.coins).toBe(3620);
      expect(result.gems).toBe(38);
    });

    it('spends gems for gem-priced products', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
        currency: Currency.GEMS,
        price: 40,
      });
      mockTx.user.updateMany.mockResolvedValue({ count: 1 });
      mockTx.purchase.create.mockResolvedValue({
        id: 'cpurch2',
        currency: Currency.GEMS,
        price: 40,
        createdAt: new Date(),
        product: coinProduct,
      });
      mockTx.user.findUnique.mockResolvedValue({ coins: 4820, gems: 0 });

      await service.purchase('cuser1', 'cprod1');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const updateArg = mockTx.user.updateMany.mock.calls[0][0] as {
        where: { gems?: { gte: number } };
        data: { gems?: { decrement: number } };
      };
      expect(updateArg.where.gems).toEqual({ gte: 40 });
      expect(updateArg.data.gems).toEqual({ decrement: 40 });
    });
  });
});
