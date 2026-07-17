import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginatedProductsDto } from './dto/paginated-products.dto';
import {
  AdminProductDto,
  PaginatedAdminProductsDto,
} from './dto/admin-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { PurchaseResponseDto } from './dto/purchase-response.dto';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

// Price is sorted per currency (coins with coins, gems with gems) so a
// low gem price never appears "cheaper" than a higher coin price. The leading
// currency group is chosen by the sort: COINS < GEMS in the enum order.
const SORT_ORDER: Record<
  ProductSort,
  | Prisma.ProductOrderByWithRelationInput
  | Prisma.ProductOrderByWithRelationInput[]
> = {
  [ProductSort.COINS_ASC]: [{ currency: 'asc' }, { price: 'asc' }],
  [ProductSort.COINS_DESC]: [{ currency: 'asc' }, { price: 'desc' }],
  [ProductSort.GEMS_ASC]: [{ currency: 'desc' }, { price: 'asc' }],
  [ProductSort.GEMS_DESC]: [{ currency: 'desc' }, { price: 'desc' }],
  [ProductSort.RARITY_ASC]: { rarityRank: 'asc' },
  [ProductSort.RARITY_DESC]: { rarityRank: 'desc' },
};

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

// What the shop shows, plus the two fields only the admin panel needs.
const ADMIN_PRODUCT_SELECT = {
  ...PRODUCT_SELECT,
  active: true,
  rarityRank: true,
} as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The catalogue as an admin needs to see it: inactive products included, so
   * something taken off the shop can be found and put back.
   */
  async findAllForAdmin(
    query: QueryProductsDto,
  ): Promise<PaginatedAdminProductsDto> {
    const where = query.category ? { category: query.category } : {};
    const [items, total] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        select: ADMIN_PRODUCT_SELECT,
        skip: query.skip,
        take: query.limit,
        // Newest first, unlike the shop: an admin who just added a product
        // expects to see it, not to hunt for it on the last page.
        orderBy: query.sort ? SORT_ORDER[query.sort] : { createdAt: 'desc' },
      }),
      this.prisma.client.product.count({ where }),
    ]);
    return { items, total, page: query.page ?? 1, limit: query.limit ?? 20 };
  }

  async create(
    actorId: string,
    dto: CreateProductDto,
    ip?: string,
  ): Promise<AdminProductDto> {
    // The slug is the shop URL and the column is unique — a clear 409 beats a
    // raw constraint violation surfacing as a 500.
    const clash = await this.prisma.client.product.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Slug already in use');

    // One transaction: a catalogue change that cannot be recorded must not stand.
    return this.prisma.client.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: { ...dto, stats: dto.stats ?? [] },
        select: ADMIN_PRODUCT_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.PRODUCT_CREATE,
          targetType: 'Product',
          targetId: product.id,
          metadata: {
            slug: dto.slug,
            price: dto.price,
            currency: dto.currency,
          },
          ip,
        },
        tx,
      );
      return product;
    });
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateProductDto,
    ip?: string,
  ): Promise<AdminProductDto> {
    const current = await this.prisma.client.product.findUnique({
      where: { id },
      select: ADMIN_PRODUCT_SELECT,
    });
    if (!current) throw new NotFoundException('Product not found');

    if (dto.slug && dto.slug !== current.slug) {
      const clash = await this.prisma.client.product.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Slug already in use');
    }

    // Only what was actually sent: a validated DTO carries the untouched fields
    // as `undefined`, and naming those would overstate what changed.
    const changed = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field);

    return this.prisma.client.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: dto,
        select: ADMIN_PRODUCT_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.PRODUCT_UPDATE,
          targetType: 'Product',
          targetId: id,
          metadata: {
            changed,
            // Price moves money, so its before/after is spelled out rather than
            // left for someone to reconstruct.
            ...(dto.price !== undefined
              ? { price: { from: current.price, to: dto.price } }
              : {}),
          },
          ip,
        },
        tx,
      );
      return product;
    });
  }

  /**
   * Puts a deactivated product back on the shop — the way back from
   * `deactivate()`. It needs its own endpoint because `active` is deliberately
   * not editable through `update()`: leaving it there would let a quiet field
   * edit take a product off the shop while the log said PRODUCT_UPDATE.
   *
   * Recorded as an update (there is no ACTIVATE action) with the flag's
   * before/after spelled out, so the movement is still readable.
   */
  async activate(
    actorId: string,
    id: string,
    ip?: string,
  ): Promise<AdminProductDto> {
    const current = await this.prisma.client.product.findUnique({
      where: { id },
      select: { active: true },
    });
    if (!current) throw new NotFoundException('Product not found');

    return this.prisma.client.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: { active: true },
        select: ADMIN_PRODUCT_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.PRODUCT_UPDATE,
          targetType: 'Product',
          targetId: id,
          metadata: {
            changed: ['active'],
            active: { from: current.active, to: true },
          },
          ip,
        },
        tx,
      );
      return product;
    });
  }

  /**
   * Takes a product off the shop. Deliberately not a delete: `Purchase.product`
   * has no cascade, so removing a purchased product fails on the foreign key —
   * and the history must keep pointing at what was actually bought. The shop
   * already filters on `active`, so this is what removal means, and it can be
   * undone by setting the flag back.
   */
  async deactivate(
    actorId: string,
    id: string,
    ip?: string,
  ): Promise<AdminProductDto> {
    const current = await this.prisma.client.product.findUnique({
      where: { id },
      select: { slug: true },
    });
    if (!current) throw new NotFoundException('Product not found');

    return this.prisma.client.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: { active: false },
        select: ADMIN_PRODUCT_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.PRODUCT_DEACTIVATE,
          targetType: 'Product',
          targetId: id,
          metadata: { slug: current.slug },
          ip,
        },
        tx,
      );
      return product;
    });
  }

  async findAll(query: QueryProductsDto): Promise<PaginatedProductsDto> {
    const where = {
      active: true,
      ...(query.category ? { category: query.category } : {}),
    };
    const orderBy = query.sort
      ? SORT_ORDER[query.sort]
      : { createdAt: 'asc' as const };

    const [items, total] = await Promise.all([
      this.prisma.client.product.findMany({
        where,
        select: PRODUCT_SELECT,
        skip: query.skip,
        take: query.limit,
        orderBy,
      }),
      this.prisma.client.product.count({ where }),
    ]);

    return { items, total, page: query.page ?? 1, limit: query.limit ?? 20 };
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
