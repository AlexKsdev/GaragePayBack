import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { GEM_PACKS } from '../../config/gem-packs.config';
import { STRIPE_CLIENT } from './stripe.provider';

const mockTx = {
  payment: { findUnique: jest.fn(), update: jest.fn() },
  user: { update: jest.fn() },
};

const mockPrisma = {
  client: {
    payment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { update: jest.fn() },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  },
};

const mockStripe = {
  checkout: { sessions: { create: jest.fn() } },
  webhooks: { constructEvent: jest.fn() },
};

const basePayment = {
  id: 'cpayment1',
  userId: 'cuser1',
  amount: 1000,
  gems: 0,
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
        { provide: STRIPE_CLIENT, useValue: mockStripe },
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
  });

  describe('createCheckout()', () => {
    it('throws NotFoundException for an unknown pack', async () => {
      await expect(service.createCheckout('cuser1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('creates a PENDING payment and a Stripe session priced from config', async () => {
      const pack = GEM_PACKS[0];
      mockPrisma.client.payment.create.mockResolvedValue({ id: 'cpay1' });
      mockPrisma.client.payment.update.mockResolvedValue({});
      mockStripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });

      const result = await service.createCheckout('cuser1', pack.id);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const paymentArg = mockPrisma.client.payment.create.mock.calls[0][0] as {
        data: { userId: string; amount: number; gems: number };
      };
      expect(paymentArg.data).toMatchObject({
        userId: 'cuser1',
        amount: pack.priceCents,
        gems: pack.gems,
      });

      const sessionCreate = mockStripe.checkout.sessions.create;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const sessionArg = sessionCreate.mock.calls[0][0] as {
        metadata: { paymentId: string };
        line_items: { price_data: { unit_amount: number } }[];
      };
      expect(sessionArg.metadata.paymentId).toBe('cpay1');
      expect(sessionArg.line_items[0].price_data.unit_amount).toBe(
        pack.priceCents,
      );
      expect(result).toEqual({
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        paymentId: 'cpay1',
      });
    });
  });

  describe('handleWebhook()', () => {
    const OLD_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
    beforeAll(() => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    });
    afterAll(() => {
      process.env.STRIPE_WEBHOOK_SECRET = OLD_SECRET;
    });

    it('rejects an invalid signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('bad sig');
      });
      await expect(
        service.handleWebhook(Buffer.from('{}'), 'sig'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('ignores event types other than checkout.session.completed', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.created',
        data: { object: {} },
      });
      await service.handleWebhook(Buffer.from('{}'), 'sig');
      expect(mockPrisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('credits gems and marks the payment succeeded on completion', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: { metadata: { paymentId: 'cpay1' } } },
      });
      mockTx.payment.findUnique.mockResolvedValue({
        id: 'cpay1',
        userId: 'cuser1',
        gems: 550,
        status: PaymentStatus.PENDING,
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(mockTx.payment.update).toHaveBeenCalledWith({
        where: { id: 'cpay1' },
        data: { status: PaymentStatus.SUCCEEDED },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const userArg = mockTx.user.update.mock.calls[0][0] as {
        data: { gems: { increment: number } };
      };
      expect(userArg.data.gems.increment).toBe(550);
    });

    it('does not double-credit an already-succeeded payment', async () => {
      mockStripe.webhooks.constructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: { metadata: { paymentId: 'cpay1' } } },
      });
      mockTx.payment.findUnique.mockResolvedValue({
        id: 'cpay1',
        userId: 'cuser1',
        gems: 550,
        status: PaymentStatus.SUCCEEDED,
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(mockTx.payment.update).not.toHaveBeenCalled();
      expect(mockTx.user.update).not.toHaveBeenCalled();
    });
  });
});
