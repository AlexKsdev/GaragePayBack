import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AdminGuard } from './admin.guard';

const mockPrisma = {
  client: { user: { findUnique: jest.fn() } },
};

const buildContext = (userId?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { id: userId } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard(mockPrisma as unknown as PrismaService);
    jest.clearAllMocks();
  });

  it('allows an active ADMIN with 2FA enabled', async () => {
    mockPrisma.client.user.findUnique.mockResolvedValue({
      role: Role.ADMIN,
      active: true,
      totpEnabled: true,
    });
    await expect(guard.canActivate(buildContext('admin-1'))).resolves.toBe(
      true,
    );
    expect(mockPrisma.client.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      select: { role: true, active: true, totpEnabled: true },
    });
  });

  it('rejects an ADMIN who has not enabled 2FA', async () => {
    mockPrisma.client.user.findUnique.mockResolvedValue({
      role: Role.ADMIN,
      active: true,
      totpEnabled: false,
    });
    await expect(guard.canActivate(buildContext('admin-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a banned ADMIN even with 2FA enabled', async () => {
    mockPrisma.client.user.findUnique.mockResolvedValue({
      role: Role.ADMIN,
      active: false,
      totpEnabled: true,
    });
    await expect(guard.canActivate(buildContext('admin-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects a user whose DB role is USER (stale/forged admin claim)', async () => {
    mockPrisma.client.user.findUnique.mockResolvedValue({
      role: Role.USER,
      active: true,
      totpEnabled: true,
    });
    await expect(guard.canActivate(buildContext('user-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when the user no longer exists', async () => {
    mockPrisma.client.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(buildContext('ghost'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects when there is no authenticated user', async () => {
    await expect(guard.canActivate(buildContext(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
