import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

/**
 * Verifies admin privilege against the database on every request, so a demoted
 * or deleted user cannot keep acting on a still-valid JWT claim. Identity comes
 * from the JWT (run JwtGuard first); privilege is re-checked here.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException('Admin access required');

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user || user.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}
