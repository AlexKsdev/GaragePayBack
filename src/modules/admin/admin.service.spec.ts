import { Test, TestingModule } from '@nestjs/testing';
import { PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminService } from './admin.service';

const mockPrisma = {
  client: {
    user: { count: jest.fn() },
    product: { count: jest.fn() },
    payment: { aggregate: jest.fn(), findMany: jest.fn() },
  },
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();
  });

  it('aggregates counts, revenue, and recent payments', async () => {
    mockPrisma.client.user.count
      .mockResolvedValueOnce(42) // totalUsers
      .mockResolvedValueOnce(3); // totalAdmins
    mockPrisma.client.product.count.mockResolvedValue(30);
    mockPrisma.client.payment.aggregate.mockResolvedValue({
      _sum: { amount: 12345 },
    });
    const createdAt = new Date();
    // Prisma returns the buyer via the relation; the DTO flattens it to a name.
    mockPrisma.client.payment.findMany.mockResolvedValue([
      {
        id: 'p1',
        amount: 999,
        status: PaymentStatus.SUCCEEDED,
        createdAt,
        user: { name: 'Steve_PureCraft' },
      },
    ]);

    const stats = await service.getStats();

    expect(stats.totalUsers).toBe(42);
    expect(stats.totalAdmins).toBe(3);
    expect(stats.totalProducts).toBe(30);
    expect(stats.revenueCents).toBe(12345);
    // The dashboard shows the nickname, not the raw user id.
    expect(stats.recentPayments).toEqual([
      {
        id: 'p1',
        amount: 999,
        status: PaymentStatus.SUCCEEDED,
        createdAt,
        userName: 'Steve_PureCraft',
      },
    ]);
    expect(mockPrisma.client.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
    );
    expect(mockPrisma.client.user.count).toHaveBeenNthCalledWith(2, {
      where: { role: Role.ADMIN },
    });
  });

  // Revenue must mean money actually taken — counting pending or failed
  // attempts would overstate it on the dashboard.
  it('counts revenue from succeeded payments only', async () => {
    mockPrisma.client.user.count.mockResolvedValue(0);
    mockPrisma.client.product.count.mockResolvedValue(0);
    mockPrisma.client.payment.aggregate.mockResolvedValue({
      _sum: { amount: 500 },
    });
    mockPrisma.client.payment.findMany.mockResolvedValue([]);

    await service.getStats();

    expect(mockPrisma.client.payment.aggregate).toHaveBeenCalledWith({
      _sum: { amount: true },
      where: { status: PaymentStatus.SUCCEEDED },
    });
  });

  // Prisma sums to null on an empty set, which would render as "$NaN".
  it('defaults revenue to 0 when there are no succeeded payments', async () => {
    mockPrisma.client.user.count.mockResolvedValue(0);
    mockPrisma.client.product.count.mockResolvedValue(0);
    mockPrisma.client.payment.aggregate.mockResolvedValue({
      _sum: { amount: null },
    });
    mockPrisma.client.payment.findMany.mockResolvedValue([]);

    const stats = await service.getStats();
    expect(stats.revenueCents).toBe(0);
  });

  it('takes only the five most recent payments, newest first', async () => {
    mockPrisma.client.user.count.mockResolvedValue(0);
    mockPrisma.client.product.count.mockResolvedValue(0);
    mockPrisma.client.payment.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    });
    mockPrisma.client.payment.findMany.mockResolvedValue([]);

    await service.getStats();

    expect(mockPrisma.client.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, orderBy: { createdAt: 'desc' } }),
    );
  });
});
