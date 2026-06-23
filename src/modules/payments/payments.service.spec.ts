import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  client: {
    payment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
};

const basePayment = {
  id: 'cpayment1',
  userId: 'cuser1',
  amount: 1000,
  description: null,
  status: PaymentStatus.PENDING,
  stripePaymentId: null,
  createdAt: new Date(),
};

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create()', () => {
    it('creates payment with userId from argument', async () => {
      mockPrisma.client.payment.create.mockResolvedValue({ ...basePayment });
      const result = await service.create('cuser1', { amount: 1000 });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const call = mockPrisma.client.payment.create.mock.calls[0][0] as {
        data: { userId: string };
      };
      expect(call.data.userId).toBe('cuser1');
      expect(result.id).toBe('cpayment1');
    });

    it('creates payment with PENDING status by default', async () => {
      mockPrisma.client.payment.create.mockResolvedValue({ ...basePayment });
      const result = await service.create('cuser1', { amount: 500 });
      expect(result.status).toBe(PaymentStatus.PENDING);
    });
  });

  describe('findOne()', () => {
    it('throws NotFoundException when payment does not exist', async () => {
      mockPrisma.client.payment.findUnique.mockResolvedValue(null);
      await expect(
        service.findOne('cuser1', 'cnonexistent', Role.USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for wrong userId', async () => {
      mockPrisma.client.payment.findUnique.mockResolvedValue({
        ...basePayment,
      });
      await expect(
        service.findOne('cother', 'cpayment1', Role.USER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to view any payment', async () => {
      mockPrisma.client.payment.findUnique.mockResolvedValue({
        ...basePayment,
      });
      const result = await service.findOne('cadmin', 'cpayment1', Role.ADMIN);
      expect(result.id).toBe('cpayment1');
    });
  });
});
