import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, Role } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { assertOwnerOrAdmin } from '../../common/ownership.util';
import { frontendBaseUrl } from '../../config/frontend.config';
import {
  findGemPack,
  GEM_PACKS,
  GemPack,
  PAYMENT_CURRENCY,
} from '../../config/gem-packs.config';
import { CheckoutResponseDto } from './dto/checkout-response.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { STRIPE_CLIENT } from './stripe.provider';

const PAYMENT_SELECT = {
  id: true,
  userId: true,
  amount: true,
  gems: true,
  description: true,
  status: true,
  stripePaymentId: true,
  createdAt: true,
} as const;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
  ) {}

  getGemPacks(): GemPack[] {
    return GEM_PACKS;
  }

  /**
   * Start a real-money purchase of a gem pack. Creates a PENDING Payment (with
   * the gems to credit) and a Stripe Checkout session; gems are only credited
   * later by the webhook once Stripe confirms the charge. The price comes from
   * server-side config — the client only picks a pack id.
   */
  async createCheckout(
    userId: string,
    packId: string,
  ): Promise<CheckoutResponseDto> {
    const pack = findGemPack(packId);
    if (!pack) throw new NotFoundException('Gem pack not found');

    const payment = await this.prisma.client.payment.create({
      data: {
        userId,
        amount: pack.priceCents,
        gems: pack.gems,
        description: `Gem pack: ${pack.name}`,
      },
      select: { id: true },
    });

    const frontendUrl = frontendBaseUrl();

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PAYMENT_CURRENCY,
            unit_amount: pack.priceCents,
            product_data: { name: `${pack.name} (${pack.gems} gems)` },
          },
        },
      ],
      metadata: { paymentId: payment.id },
      success_url: `${frontendUrl}/checkout/success`,
      cancel_url: `${frontendUrl}/shop?payment=cancelled`,
    });

    await this.prisma.client.payment.update({
      where: { id: payment.id },
      data: { stripePaymentId: session.id },
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }
    return { url: session.url, paymentId: payment.id };
  }

  /**
   * Verify a Stripe webhook and, on a completed checkout, credit the gems.
   * Signature verification is the trust boundary — the body must be the raw
   * bytes Stripe sent. Crediting is idempotent (only a still-PENDING payment
   * is fulfilled) so Stripe's retries can't double-credit.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException('Webhook secret not configured');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }

    if (event.type !== 'checkout.session.completed') return;

    const session = event.data.object;
    const paymentId = session.metadata?.paymentId;
    if (!paymentId) return;

    await this.fulfillGemPayment(paymentId);
  }

  /** Atomically mark a payment SUCCEEDED and credit its gems, exactly once. */
  private async fulfillGemPayment(paymentId: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        select: { id: true, userId: true, gems: true, status: true },
      });
      if (!payment || payment.status !== PaymentStatus.PENDING) return;

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.SUCCEEDED },
      });
      await tx.user.update({
        where: { id: payment.userId },
        data: { gems: { increment: payment.gems } },
      });
    });
    this.logger.log(`Fulfilled gem payment ${paymentId}`);
  }

  async create(
    userId: string,
    dto: CreatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.prisma.client.payment.create({
      data: { userId, amount: dto.amount, description: dto.description },
      select: PAYMENT_SELECT,
    });
  }

  async findAll(
    userId: string,
    role: Role,
    pagination: PaginationDto,
  ): Promise<PaymentResponseDto[]> {
    const where = role === Role.ADMIN ? {} : { userId };
    return this.prisma.client.payment.findMany({
      where,
      select: PAYMENT_SELECT,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    userId: string,
    paymentId: string,
    role: Role,
  ): Promise<PaymentResponseDto> {
    const payment = await this.prisma.client.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    assertOwnerOrAdmin(
      userId,
      payment.userId,
      role,
      'Cannot access this payment',
    );
    return payment;
  }

  async updateStatus(
    paymentId: string,
    dto: UpdatePaymentStatusDto,
  ): Promise<PaymentResponseDto> {
    const payment = await this.prisma.client.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    return this.prisma.client.payment.update({
      where: { id: paymentId },
      data: dto,
      select: PAYMENT_SELECT,
    });
  }
}
