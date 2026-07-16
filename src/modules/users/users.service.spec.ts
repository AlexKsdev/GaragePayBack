import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  client: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    adminAction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
};

// Hands the callback the client itself, so `tx.user.update` is the same mock the
// assertions below already watch.
mockPrisma.client.$transaction.mockImplementation((cb: unknown) =>
  (cb as (tx: unknown) => unknown)(mockPrisma.client),
);

/** The row the service wrote to the audit log, or undefined if it wrote none. */
function auditRow(): Record<string, unknown> | undefined {
  const calls = mockPrisma.client.adminAction.create.mock.calls as [
    { data: Record<string, unknown> },
  ][];
  return calls.length ? calls[0][0].data : undefined;
}

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
        // The real thing over a mock: these tests should fail if an admin
        // mutation stops being recorded.
        AuditService,
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findById()', () => {
    it('throws NotFoundException when the owner does not exist', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      await expect(
        service.findById('cnonexistent', 'cnonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns own user without passwordHash', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      const result = await service.findById('ctest1', 'ctest1');
      expect(
        (result as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
      expect(result.email).toBe('user@test.com');
    });

    it('forbids reading another user (no email/balance leak) — KAN-51', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ role: Role.USER }); // requester is not admin in the DB
      await expect(service.findById('cother', 'ctest1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('does not even look up the target when the caller is not authorized', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ role: Role.USER });
      await expect(service.findById('cother', 'ctest1')).rejects.toThrow(
        ForbiddenException,
      );
      // Only the requester's role check ran — the target row was never read,
      // so a non-owner cannot probe which ids exist.
      expect(mockPrisma.client.user.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrisma.client.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'cother' },
        select: { role: true },
      });
    });

    it('allows an admin to read another user', async () => {
      mockPrisma.client.user.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN }) // requester admin check (DB)
        .mockResolvedValueOnce({ ...baseUser }); // target lookup
      const result = await service.findById('cadmin', 'ctest1');
      expect(result.email).toBe('user@test.com');
    });
  });

  describe('update()', () => {
    it('throws ForbiddenException when non-owner updates', async () => {
      // Authz runs first, so the requester's role check is the only lookup.
      mockPrisma.client.user.findUnique.mockResolvedValueOnce({
        role: Role.USER,
      });
      await expect(
        service.update('cother', 'ctest1', { name: 'New' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.client.user.findUnique).toHaveBeenCalledTimes(1);
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
        .mockResolvedValueOnce({ role: Role.ADMIN }) // requester admin check (DB) — runs first
        .mockResolvedValueOnce({ ...baseUser }); // target lookup
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
      // Authz runs first, so the requester's role check is the only lookup.
      mockPrisma.client.user.findUnique.mockResolvedValueOnce({
        role: Role.USER,
      });
      await expect(service.delete('cother', 'ctest1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.client.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('allows owner to delete their own account', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      mockPrisma.client.user.delete.mockResolvedValue(undefined);
      await expect(service.delete('ctest1', 'ctest1')).resolves.toBeUndefined();
    });
  });

  describe('audit log', () => {
    it('records an admin deleting someone else, with the actor and ip', async () => {
      // Requester is an admin (authz lookup), then the target exists.
      mockPrisma.client.user.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN })
        .mockResolvedValueOnce({ id: 'ctest1' });
      mockPrisma.client.user.delete.mockResolvedValue(undefined);

      await service.delete('cadmin', 'ctest1', '203.0.113.7');

      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.USER_DELETE,
        targetType: 'User',
        targetId: 'ctest1',
        ip: '203.0.113.7',
      });
    });

    it('records nothing when a user deletes their own account', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      mockPrisma.client.user.delete.mockResolvedValue(undefined);

      await service.delete('ctest1', 'ctest1', '203.0.113.7');

      expect(auditRow()).toBeUndefined();
    });

    it('records an admin editing someone else, naming the changed fields', async () => {
      mockPrisma.client.user.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN })
        .mockResolvedValueOnce({ email: 'old@test.com' })
        .mockResolvedValueOnce(null); // the new email is free
      mockPrisma.client.user.update.mockResolvedValue({ ...baseUser });

      await service.update('cadmin', 'ctest1', { email: 'new@test.com' });

      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.USER_UPDATE,
        targetId: 'ctest1',
        metadata: { changed: ['email'], email: 'new@test.com' },
      });
    });

    // A validated DTO carries the fields that were not sent as `undefined`, so
    // a naive Object.keys() claims they changed. An audit log that overstates
    // what happened is worse than none — it misleads the incident review.
    it('names only the fields actually sent, not the DTO shape', async () => {
      mockPrisma.client.user.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN })
        .mockResolvedValueOnce({ email: 'old@test.com' });
      mockPrisma.client.user.update.mockResolvedValue({ ...baseUser });

      // What class-validator hands the service when only `name` was sent.
      const dto = { email: undefined, name: 'Renamed' };
      await service.update('cadmin', 'ctest1', dto);

      expect(auditRow()?.metadata).toMatchObject({ changed: ['name'] });
    });

    it('records nothing when a user edits their own profile', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValueOnce({
        email: 'user@test.com',
      });
      mockPrisma.client.user.update.mockResolvedValue({ ...baseUser });

      await service.update('ctest1', 'ctest1', { name: 'New Name' });

      expect(auditRow()).toBeUndefined();
    });

    // Fail-closed: no unlogged admin mutation, even if the log write breaks.
    it('rolls the delete back when the audit write fails', async () => {
      mockPrisma.client.user.findUnique
        .mockResolvedValueOnce({ role: Role.ADMIN })
        .mockResolvedValueOnce({ id: 'ctest1' });
      mockPrisma.client.adminAction.create.mockRejectedValueOnce(
        new Error('log write failed'),
      );

      await expect(service.delete('cadmin', 'ctest1')).rejects.toThrow(
        'log write failed',
      );
      expect(mockPrisma.client.user.delete).not.toHaveBeenCalled();
    });
  });
});
