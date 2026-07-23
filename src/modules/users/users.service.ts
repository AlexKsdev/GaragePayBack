import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { assertOwnerOrAdmin } from '../../common/ownership.util';
import { AuditService } from '../audit/audit.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { levelInfo, levelUpReward } from './level.util';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  twoFactorEnabled: true,
  rank: true,
  avatar: true,
  xp: true,
  coins: true,
  gems: true,
  playtimeMinutes: true,
  kills: true,
  deaths: true,
  blocksPlaced: true,
  streak: true,
  createdAt: true,
} as const;

// Row as stored: `xp` is total lifetime XP; level/xpNext are derived, not stored.
type UserRow = Omit<UserResponseDto, 'level' | 'xpNext'>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Attach derived level/progress (from total xp) to a stored user row. */
  private present(user: UserRow): UserResponseDto {
    const info = levelInfo(user.xp);
    return {
      ...user,
      level: info.level,
      xp: info.xpIntoLevel,
      xpNext: info.xpForNextLevel,
    };
  }

  /**
   * Full record (email, balances, role) — owner or admin only. Authorized
   * before the lookup so a non-owner cannot probe which ids exist.
   */
  async findById(
    requestingUserId: string,
    targetId: string,
  ): Promise<UserResponseDto> {
    await assertOwnerOrAdmin(
      this.prisma,
      requestingUserId,
      targetId,
      'Cannot view another user',
    );

    const user = await this.prisma.client.user.findUnique({
      where: { id: targetId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.present(user);
  }

  /**
   * One page of users for the admin table, optionally filtered by name or
   * email. Admin-gated at the controller.
   */
  async findAll(
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedUsersResponseDto> {
    const where = this.searchFilter(search);

    // The count runs against the same filter, or the pager would offer pages
    // that don't exist.
    const [users, total] = await Promise.all([
      this.prisma.client.user.findMany({
        where,
        select: USER_SELECT,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.user.count({ where }),
    ]);

    return {
      items: users.map((user) => this.present(user)),
      total,
      page: pagination.page ?? 1,
      limit: pagination.limit ?? 20,
    };
  }

  private searchFilter(search?: string): Prisma.UserWhereInput {
    const term = search?.trim();
    if (!term) return {};
    return {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ],
    };
  }

  /**
   * Award XP; level and progress re-derive on read. Every level gained also
   * grants a coin + gem bonus (see COINS_PER_LEVEL / GEMS_PER_LEVEL).
   */
  async grantXp(userId: string, amount: number): Promise<UserResponseDto> {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive integer');
    }
    const current = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { xp: true },
    });
    if (!current) throw new NotFoundException('User not found');

    const reward = levelUpReward(current.xp, current.xp + amount);
    const user = await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        xp: { increment: amount },
        ...(reward.levelsGained > 0
          ? {
              coins: { increment: reward.coins },
              gems: { increment: reward.gems },
            }
          : {}),
      },
      select: USER_SELECT,
    });
    return this.present(user);
  }

  async update(
    requestingUserId: string,
    targetId: string,
    dto: UpdateUserDto,
    ip?: string,
  ): Promise<UserResponseDto> {
    // Authorize before the lookup so a non-owner cannot tell a real id from a
    // fake one by the 404-vs-403 response.
    await assertOwnerOrAdmin(
      this.prisma,
      requestingUserId,
      targetId,
      'Cannot update another user',
    );

    const target = await this.prisma.client.user.findUnique({
      where: { id: targetId },
      select: { email: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (dto.email && dto.email !== target.email) {
      const taken = await this.prisma.client.user.findUnique({
        where: { email: dto.email },
      });
      if (taken) throw new ConflictException('Email already in use');
    }

    // One transaction, so an admin edit that cannot be recorded does not stand.
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: targetId },
        data: dto,
        select: USER_SELECT,
      });
      await this.audit.recordIfActingOnAnother(
        {
          actorId: requestingUserId,
          ownerId: targetId,
          action: AdminActionType.USER_UPDATE,
          targetType: 'User',
          targetId,
          // Enough to reconstruct the change without copying the whole row.
          // Only the fields actually sent: a validated DTO carries the omitted
          // ones as `undefined`, and naming those would overstate what changed.
          metadata: {
            changed: Object.entries(dto)
              .filter(([, value]) => value !== undefined)
              .map(([field]) => field),
            email: dto.email ?? null,
          },
          ip,
        },
        tx,
      );
      return row;
    });
    return this.present(updated);
  }

  /**
   * Admin-only (gated by AdminGuard). Changing a role is recorded with the old
   * and new value inside the same transaction as the change itself.
   */
  async changeRole(
    actorId: string,
    targetId: string,
    role: Role,
    ip?: string,
  ): Promise<UserResponseDto> {
    // Refused before the lookup: the last admin demoting themselves would lock
    // everyone out of the panel, recoverable only by editing the database.
    if (actorId === targetId) {
      throw new BadRequestException('Cannot change your own role');
    }

    const target = await this.prisma.client.user.findUnique({
      where: { id: targetId },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: targetId },
        data: { role },
        select: USER_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.USER_ROLE_CHANGE,
          targetType: 'User',
          targetId,
          metadata: { from: target.role, to: role },
          ip,
        },
        tx,
      );
      return row;
    });
    return this.present(updated);
  }

  /**
   * Admin-only (gated by AdminGuard). Takes a delta rather than a new total, so
   * two admins adjusting at once both land instead of one overwriting the other.
   */
  async adjustBalance(
    actorId: string,
    targetId: string,
    dto: AdjustBalanceDto,
    ip?: string,
  ): Promise<UserResponseDto> {
    const coins = dto.coins ?? 0;
    const gems = dto.gems ?? 0;
    if (coins === 0 && gems === 0) {
      throw new BadRequestException('Provide a non-zero coins or gems change');
    }

    const target = await this.prisma.client.user.findUnique({
      where: { id: targetId },
      select: { coins: true, gems: true },
    });
    if (!target) throw new NotFoundException('User not found');

    // Neither the shop nor the profile can mean anything sensible by a negative
    // balance, so an overdrawing deduction is refused rather than clamped.
    if (target.coins + coins < 0 || target.gems + gems < 0) {
      throw new BadRequestException('Adjustment would overdraw the balance');
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: targetId },
        data: {
          ...(coins !== 0 ? { coins: { increment: coins } } : {}),
          ...(gems !== 0 ? { gems: { increment: gems } } : {}),
        },
        select: USER_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.USER_BALANCE_CHANGE,
          targetType: 'User',
          targetId,
          // Before and after, so an incident review can read the movement
          // without replaying every row.
          metadata: {
            ...(coins !== 0
              ? {
                  coins: {
                    from: target.coins,
                    delta: coins,
                    to: target.coins + coins,
                  },
                }
              : {}),
            ...(gems !== 0
              ? {
                  gems: {
                    from: target.gems,
                    delta: gems,
                    to: target.gems + gems,
                  },
                }
              : {}),
          },
          ip,
        },
        tx,
      );
      return row;
    });
    return this.present(updated);
  }

  async delete(
    requestingUserId: string,
    targetId: string,
    ip?: string,
  ): Promise<void> {
    // Authorize before the lookup so a non-owner cannot tell a real id from a
    // fake one by the 404-vs-403 response.
    await assertOwnerOrAdmin(
      this.prisma,
      requestingUserId,
      targetId,
      'Cannot delete another user',
    );

    const target = await this.prisma.client.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.client.$transaction(async (tx) => {
      // Recorded before the row goes: afterwards there is nothing left to
      // describe, and the log has to outlive the account (hence no FK on actorId).
      await this.audit.recordIfActingOnAnother(
        {
          actorId: requestingUserId,
          ownerId: targetId,
          action: AdminActionType.USER_DELETE,
          targetType: 'User',
          targetId,
          ip,
        },
        tx,
      );
      await tx.user.delete({ where: { id: targetId } });
    });
  }
}
