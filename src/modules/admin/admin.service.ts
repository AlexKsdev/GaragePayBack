import { Injectable } from '@nestjs/common';
import { PaymentStatus, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminStatsResponseDto } from './dto/admin-stats-response.dto';

const RECENT_PAYMENTS_LIMIT = 5;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Read-only dashboard aggregates from existing tables. */
  async getStats(): Promise<AdminStatsResponseDto> {
    const [totalUsers, totalAdmins, totalProducts, revenue, recentPayments] =
      await Promise.all([
        this.prisma.client.user.count(),
        this.prisma.client.user.count({ where: { role: Role.ADMIN } }),
        this.prisma.client.product.count(),
        // Succeeded only: pending and failed attempts are not money taken.
        this.prisma.client.payment.aggregate({
          _sum: { amount: true },
          where: { status: PaymentStatus.SUCCEEDED },
        }),
        this.prisma.client.payment.findMany({
          take: RECENT_PAYMENTS_LIMIT,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            userId: true,
          },
        }),
      ]);

    return {
      totalUsers,
      totalAdmins,
      totalProducts,
      // Prisma sums to null on an empty set.
      revenueCents: revenue._sum.amount ?? 0,
      recentPayments,
    };
  }
}
