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
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException('Admin access required');

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { role: true, active: true, twoFactorEnabled: true },
    });
    if (!user || user.role !== Role.ADMIN || !user.active) {
      throw new ForbiddenException('Admin access required');
    }
    // No admin without 2FA. They can still sign in and enrol — only the admin
    // surface is closed until they do — so this locks nobody out permanently.
    if (!user.twoFactorEnabled) {
      throw new ForbiddenException(
        'Two-factor authentication is required for admin access',
      );
    }
    return true;
  }
}
