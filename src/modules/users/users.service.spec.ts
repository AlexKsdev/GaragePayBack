import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  client: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
};

const baseUser = {
  id: 'ctest1',
  email: 'user@test.com',
  name: 'Test',
  role: Role.USER,
  xp: 0,
  createdAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findById()', () => {
    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('cnonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns user without passwordHash', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      const result = await service.findById('ctest1');
      expect(
        (result as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
      expect(result.email).toBe('user@test.com');
    });
  });

  describe('update()', () => {
    it('throws ForbiddenException when non-owner updates', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      await expect(
        service.update('cother', 'ctest1', { name: 'New' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when new email is already taken', async () => {
      mockPrisma.client.user.findUnique
        .mockResolvedValueOnce({ ...baseUser })
        .mockResolvedValueOnce({ id: 'cother', email: 'taken@test.com' });
      await expect(
        service.update('ctest1', 'ctest1', { email: 'taken@test.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows admin to update another user', async () => {
      mockPrisma.client.user.findUnique
        .mockResolvedValueOnce({ ...baseUser }) // target lookup
        .mockResolvedValueOnce({ role: Role.ADMIN }); // requester admin check (DB)
      mockPrisma.client.user.update.mockResolvedValue({
        ...baseUser,
        name: 'Updated',
      });

      const result = await service.update('cadmin', 'ctest1', {
        name: 'Updated',
      });
      expect(result.name).toBe('Updated');
    });
  });

  describe('grantXp()', () => {
    it('increments xp and awards 200 coins + 2 gems per level gained', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ xp: 0 }); // level 1
      mockPrisma.client.user.update.mockResolvedValue({ ...baseUser, xp: 100 });

      const result = await service.grantXp('ctest1', 100); // -> level 2
      expect(mockPrisma.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            xp: { increment: 100 },
            coins: { increment: 200 },
            gems: { increment: 2 },
          },
        }),
      );
      expect(result.level).toBe(2);
      expect(result.xpNext).toBe(120);
    });

    it('awards the bonus for every level crossed at once', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ xp: 0 });
      mockPrisma.client.user.update.mockResolvedValue({ ...baseUser, xp: 220 });

      await service.grantXp('ctest1', 220); // level 1 -> 3 = 2 levels
      expect(mockPrisma.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            xp: { increment: 220 },
            coins: { increment: 400 },
            gems: { increment: 4 },
          },
        }),
      );
    });

    it('does not touch coins/gems when no level is gained', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ xp: 0 });
      mockPrisma.client.user.update.mockResolvedValue({ ...baseUser, xp: 50 });

      await service.grantXp('ctest1', 50);
      const data = mockPrisma.client.user.update.mock.calls[0][0].data;
      expect(data).toEqual({ xp: { increment: 50 } });
    });

    it('rejects a non-positive amount', async () => {
      await expect(service.grantXp('ctest1', 0)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('delete()', () => {
    it('throws ForbiddenException for non-owner/non-admin', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      await expect(service.delete('cother', 'ctest1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows owner to delete their own account', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      mockPrisma.client.user.delete.mockResolvedValue(undefined);
      await expect(service.delete('ctest1', 'ctest1')).resolves.toBeUndefined();
    });
  });
});
