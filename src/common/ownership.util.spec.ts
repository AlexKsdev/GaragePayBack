import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { assertOwnerOrAdmin, isAdmin } from './ownership.util';

const mockPrisma = { client: { user: { findUnique: jest.fn() } } };
const prisma = mockPrisma as unknown as PrismaService;

describe('ownership authorization (DB-backed)', () => {
  afterEach(() => jest.clearAllMocks());

  describe('assertOwnerOrAdmin', () => {
    it('allows the owner without hitting the DB', async () => {
      await expect(
        assertOwnerOrAdmin(prisma, 'user-1', 'user-1'),
      ).resolves.toBeUndefined();
      expect(mockPrisma.client.user.findUnique).not.toHaveBeenCalled();
    });

    it('allows a non-owner whose DB role is ADMIN', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ role: Role.ADMIN });
      await expect(
        assertOwnerOrAdmin(prisma, 'admin-1', 'user-2'),
      ).resolves.toBeUndefined();
      expect(mockPrisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        select: { role: true },
      });
    });

    it('rejects a non-owner whose DB role is USER (stale JWT admin claim)', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ role: Role.USER });
      await expect(
        assertOwnerOrAdmin(prisma, 'user-1', 'user-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('uses the provided message', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ role: Role.USER });
      await expect(
        assertOwnerOrAdmin(prisma, 'user-1', 'user-2', 'Cannot touch this'),
      ).rejects.toThrow('Cannot touch this');
    });
  });

  describe('isAdmin', () => {
    it('returns true for an ADMIN', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ role: Role.ADMIN });
      await expect(isAdmin(prisma, 'a')).resolves.toBe(true);
    });

    it('returns false for a USER', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ role: Role.USER });
      await expect(isAdmin(prisma, 'u')).resolves.toBe(false);
    });

    it('returns false when the user does not exist', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      await expect(isAdmin(prisma, 'ghost')).resolves.toBe(false);
    });
  });
});
