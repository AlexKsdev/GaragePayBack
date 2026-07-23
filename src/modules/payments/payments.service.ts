import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, PaymentStatus, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { assertOwnerOrAdmin } from '../../common/ownership.util';
import { AuditService } from '../audit/audit.service';
import { frontendBaseUrl } from '../../config/frontend.config';
import {
  findGemPack,
  GEM_PACKS,
  GemPack,
  PAYMENT_CURRENCY,
} from '../../config/gem-packs.config';
import { CheckoutResponseDto } from './dto/checkout-response.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { PaginatedPaymentsResponseDto } from './dto/paginated-payments-response.dto';
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

// Same fields as PAYMENT_SELECT plus the buyer, trimmed to what an orders table
// needs — never the password hash or other user secrets.
const ADMIN_PAYMENT_SELECT = {
  ...PAYMENT_SELECT,
  user: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly audit: AuditService,
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

  // A caller's own purchase history. Admins browse the whole catalogue through
  // findAllForAdmin instead — this route no longer widens for them.
  async findAll(
    userId: string,
    pagination: PaginationDto,
  ): Promise<PaymentResponseDto[]> {
    return this.prisma.client.payment.findMany({
      where: { userId },
      select: PAYMENT_SELECT,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForAdmin(
    query: ListPaymentsQueryDto,
  ): Promise<PaginatedPaymentsResponseDto> {
    const where: Prisma.PaymentWhereInput = query.status
      ? { status: query.status }
      : {};

    // The count runs against the same filter, or the pager would offer pages
    // that don't exist.
    const [items, total] = await Promise.all([
      this.prisma.client.payment.findMany({
        where,
        select: ADMIN_PAYMENT_SELECT,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.payment.count({ where }),
    ]);

    return {
      items,
      total,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  async findOne(
    userId: string,
    paymentId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.prisma.client.payment.findUnique({
      where: { id: paymentId },
      select: PAYMENT_SELECT,
    });
    if (!payment) throw new NotFoundException('Payment not found');
    await assertOwnerOrAdmin(
      this.prisma,
      userId,
      payment.userId,
      'Cannot access this payment',
    );
    return payment;
  }

  async updateStatus(
    paymentId: string,
    dto: UpdatePaymentStatusDto,
    actorId: string,
    ip?: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.prisma.client.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException('Payment not found');

    // Admin-only endpoint, so every call is an admin action — and one that
    // moves money, hence the unconditional record. One transaction: a status
    // change that cannot be logged does not stand.
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: dto,
        select: PAYMENT_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.PAYMENT_STATUS_UPDATE,
          targetType: 'Payment',
          targetId: paymentId,
          metadata: { from: payment.status, to: dto.status },
          ip,
        },
        tx,
      );
      return updated;
    });
  }
}
