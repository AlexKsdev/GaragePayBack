import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Currency } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from './products.service';
import { ProductSort } from './dto/query-products.dto';

const mockTx = {
  user: { updateMany: jest.fn(), findUnique: jest.fn() },
  purchase: { create: jest.fn() },
  product: { create: jest.fn(), update: jest.fn() },
  adminAction: { create: jest.fn() },
};

const mockPrisma = {
  client: {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    adminAction: { create: jest.fn() },
    // Interactive transaction: run the callback against the tx mock.
    $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  },
};

/** The row the service wrote to the audit log, or undefined if it wrote none. */
function auditRow(): Record<string, unknown> | undefined {
  const calls = mockTx.adminAction.create.mock.calls as [
    { data: Record<string, unknown> },
  ][];
  return calls.length ? calls[0][0].data : undefined;
}

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
        // The real thing over a mock: these tests should fail if a product
        // mutation stops being recorded.
        AuditService,
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

  const newProduct = {
    slug: 'iron-axe',
    category: 'Weapons',
    name: 'Iron Axe',
    emoji: '🪓',
    rarity: 'Common',
    rarityRank: 1,
    currency: Currency.COINS,
    price: 300,
  };

  describe('create()', () => {
    it('creates the product and records who did it', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue(null);
      mockTx.product.create.mockResolvedValue({
        ...coinProduct,
        ...newProduct,
      });

      const result = await service.create('cadmin', newProduct, '203.0.113.7');

      expect(result.slug).toBe('iron-axe');
      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.PRODUCT_CREATE,
        targetType: 'Product',
        metadata: { slug: 'iron-axe', price: 300, currency: Currency.COINS },
        ip: '203.0.113.7',
      });
    });

    // The slug is the shop URL, and the column is unique — a clearer 409 beats
    // a raw constraint error surfacing as a 500.
    it('refuses a slug that is already taken', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({ id: 'other' });

      await expect(service.create('cadmin', newProduct)).rejects.toThrow(
        ConflictException,
      );
      expect(mockTx.product.create).not.toHaveBeenCalled();
    });

    it('rolls the creation back when the audit write fails', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue(null);
      mockTx.adminAction.create.mockRejectedValueOnce(new Error('log down'));

      await expect(service.create('cadmin', newProduct)).rejects.toThrow(
        'log down',
      );
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
      });
      mockTx.product.update.mockResolvedValue({ ...coinProduct, price: 900 });
    });

    it('updates and records the fields that actually changed', async () => {
      const result = await service.update('cadmin', 'cprod1', { price: 900 });

      expect(result.price).toBe(900);
      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.PRODUCT_UPDATE,
        targetId: 'cprod1',
        metadata: { changed: ['price'], price: { from: 1200, to: 900 } },
      });
    });

    // A validated DTO carries the untouched fields as `undefined`; naming those
    // would have the log overstate what happened.
    it('names only the fields actually sent', async () => {
      await service.update('cadmin', 'cprod1', {
        price: 900,
        name: undefined,
        slug: undefined,
      });

      expect(auditRow()?.metadata).toMatchObject({ changed: ['price'] });
    });

    it('throws NotFoundException for an unknown product', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue(null);
      await expect(
        service.update('cadmin', 'cghost', { price: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a slug already used by another product', async () => {
      mockPrisma.client.product.findUnique
        .mockResolvedValueOnce({ ...coinProduct })
        .mockResolvedValueOnce({ id: 'cother', slug: 'taken' });

      await expect(
        service.update('cadmin', 'cprod1', { slug: 'taken' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rolls the update back when the audit write fails', async () => {
      mockTx.adminAction.create.mockRejectedValueOnce(new Error('log down'));
      await expect(
        service.update('cadmin', 'cprod1', { price: 900 }),
      ).rejects.toThrow('log down');
    });
  });

  describe('deactivate()', () => {
    // Not a delete: Purchase.product has no cascade, so removing a purchased
    // product would fail on the FK — and the history must keep pointing at what
    // was bought.
    it('flips active off rather than deleting the row', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
      });
      mockTx.product.update.mockResolvedValue({
        ...coinProduct,
        active: false,
      });

      await service.deactivate('cadmin', 'cprod1', '203.0.113.7');

      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: false } }),
      );
      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.PRODUCT_DEACTIVATE,
        targetId: 'cprod1',
        metadata: { slug: 'diamond-sword' },
        ip: '203.0.113.7',
      });
    });

    it('throws NotFoundException for an unknown product', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue(null);
      await expect(service.deactivate('cadmin', 'cghost')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rolls the deactivation back when the audit write fails', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
      });
      mockTx.adminAction.create.mockRejectedValueOnce(new Error('log down'));

      await expect(service.deactivate('cadmin', 'cprod1')).rejects.toThrow(
        'log down',
      );
    });
  });

  describe('activate()', () => {
    // Without this there is no way back: DELETE deactivates, and `active` is
    // deliberately not editable through update(), so a product taken off the
    // shop could only be restored by editing the database by hand.
    it('puts a deactivated product back on the shop', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
        active: false,
      });
      mockTx.product.update.mockResolvedValue({ ...coinProduct, active: true });

      const result = await service.activate('cadmin', 'cprod1', '203.0.113.7');

      expect(result.active).toBe(true);
      expect(mockTx.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: true } }),
      );
      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.PRODUCT_UPDATE,
        targetId: 'cprod1',
        metadata: { changed: ['active'], active: { from: false, to: true } },
        ip: '203.0.113.7',
      });
    });

    it('throws NotFoundException for an unknown product', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue(null);
      await expect(service.activate('cadmin', 'cghost')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rolls back when the audit write fails', async () => {
      mockPrisma.client.product.findUnique.mockResolvedValue({
        ...coinProduct,
        active: false,
      });
      mockTx.adminAction.create.mockRejectedValueOnce(new Error('log down'));

      await expect(service.activate('cadmin', 'cprod1')).rejects.toThrow(
        'log down',
      );
    });
  });

  describe('findAllForAdmin()', () => {
    // The admin has to see what they deactivated, or removal is one-way from
    // the panel.
    it('includes inactive products, unlike the shop listing', async () => {
      mockPrisma.client.product.findMany.mockResolvedValue([coinProduct]);
      mockPrisma.client.product.count.mockResolvedValue(1);

      await service.findAllForAdmin({ page: 1, limit: 20, skip: 0 });

      const calls = mockPrisma.client.product.findMany.mock.calls as [
        { where: Record<string, unknown> },
      ][];
      expect(calls[0][0].where.active).toBeUndefined();
    });

    // The shop leads with the oldest; an admin who just added a product expects
    // to see it, not to hunt for it on the last page.
    it('defaults to newest first, unlike the shop listing', async () => {
      mockPrisma.client.product.findMany.mockResolvedValue([]);
      mockPrisma.client.product.count.mockResolvedValue(0);

      await service.findAllForAdmin({ page: 1, limit: 20, skip: 0 });

      expect(mockPrisma.client.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('reports whether each product is active', async () => {
      mockPrisma.client.product.findMany.mockResolvedValue([
        { ...coinProduct, active: false },
      ]);
      mockPrisma.client.product.count.mockResolvedValue(1);

      const result = await service.findAllForAdmin({
        page: 1,
        limit: 20,
        skip: 0,
      });
      expect(result.items[0].active).toBe(false);
    });
  });
});
