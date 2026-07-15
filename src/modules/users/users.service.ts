import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { assertOwnerOrAdmin } from '../../common/ownership.util';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { levelInfo, levelUpReward } from './level.util';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
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
  constructor(private readonly prisma: PrismaService) {}

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

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.prisma.client.user.findMany({
      select: USER_SELECT,
    });
    return users.map((user) => this.present(user));
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

    const updated = await this.prisma.client.user.update({
      where: { id: targetId },
      data: dto,
      select: USER_SELECT,
    });
    return this.present(updated);
  }

  async delete(requestingUserId: string, targetId: string): Promise<void> {
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

    await this.prisma.client.user.delete({ where: { id: targetId } });
  }
}
