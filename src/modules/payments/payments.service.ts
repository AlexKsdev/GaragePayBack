import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

const PAYMENT_SELECT = {
  id: true,
  userId: true,
  amount: true,
  description: true,
  status: true,
  stripePaymentId: true,
  createdAt: true,
} as const;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (payment.userId !== userId && role !== Role.ADMIN) {
      throw new ForbiddenException('Cannot access this payment');
    }
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
