import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductResponseDto } from './dto/product-response.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';
import { QueryProductsDto } from './dto/query-products.dto';

const PRODUCT_SELECT = {
  id: true,
  slug: true,
  category: true,
  name: true,
  emoji: true,
  rarity: true,
  currency: true,
  price: true,
  badge: true,
  stats: true,
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryProductsDto): Promise<ProductResponseDto[]> {
    return this.prisma.client.product.findMany({
      where: {
        active: true,
        ...(query.category ? { category: query.category } : {}),
      },
      select: PRODUCT_SELECT,
      skip: query.skip,
      take: query.limit,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(slug: string): Promise<ProductResponseDto> {
    const product = await this.prisma.client.product.findFirst({
      where: { slug, active: true },
      select: PRODUCT_SELECT,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /**
   * Buy a product with in-game currency. Balance check + deduction + purchase
   * record run in one transaction; the conditional `updateMany` makes the debit
   * atomic (no read-then-write race) — count 0 means the balance was too low.
   */
  async purchase(
    userId: string,
    productId: string,
  ): Promise<PurchaseResponseDto> {
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
      select: { id: true, currency: true, price: true, active: true },
    });
    if (!product || !product.active) {
      throw new NotFoundException('Product not found');
    }

    const funds = this.fundsFilter(product.currency, product.price);

    return this.prisma.client.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: { id: userId, ...funds.where },
        data: funds.data,
      });
      if (debited.count === 0) {
        throw new BadRequestException(
          `Insufficient ${product.currency.toLowerCase()}`,
        );
      }

      const purchase = await tx.purchase.create({
        data: {
          userId,
          productId,
          currency: product.currency,
          price: product.price,
        },
        select: {
          id: true,
          currency: true,
          price: true,
          createdAt: true,
          product: {
            select: { id: true, slug: true, name: true, emoji: true },
          },
        },
      });

      const balances = await tx.user.findUnique({
        where: { id: userId },
        select: { coins: true, gems: true },
      });

      return { ...purchase, coins: balances!.coins, gems: balances!.gems };
    });
  }

  /** Atomic-debit where/data for the currency the product is priced in. */
  private fundsFilter(
    currency: Currency,
    price: number,
  ): { where: Prisma.UserWhereInput; data: Prisma.UserUpdateInput } {
    return currency === Currency.GEMS
      ? {
          where: { gems: { gte: price } },
          data: { gems: { decrement: price } },
        }
      : {
          where: { coins: { gte: price } },
          data: { coins: { decrement: price } },
        };
  }
}
