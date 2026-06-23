import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(): Promise<UserResponseDto[]> {
    return this.prisma.client.user.findMany({ select: USER_SELECT });
  }

  async update(
    requestingUserId: string,
    targetId: string,
    dto: UpdateUserDto,
    requestingRole?: Role,
  ): Promise<UserResponseDto> {
    const target = await this.prisma.client.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');

    if (requestingUserId !== targetId && requestingRole !== Role.ADMIN) {
      throw new ForbiddenException('Cannot update another user');
    }

    if (dto.email && dto.email !== target.email) {
      const taken = await this.prisma.client.user.findUnique({
        where: { email: dto.email },
      });
      if (taken) throw new ConflictException('Email already in use');
    }

    return this.prisma.client.user.update({
      where: { id: targetId },
      data: dto,
      select: USER_SELECT,
    });
  }

  async delete(
    requestingUserId: string,
    targetId: string,
    requestingRole: Role,
  ): Promise<void> {
    const target = await this.prisma.client.user.findUnique({
      where: { id: targetId },
    });
    if (!target) throw new NotFoundException('User not found');

    if (requestingUserId !== targetId && requestingRole !== Role.ADMIN) {
      throw new ForbiddenException('Cannot delete another user');
    }

    await this.prisma.client.user.delete({ where: { id: targetId } });
  }
}
