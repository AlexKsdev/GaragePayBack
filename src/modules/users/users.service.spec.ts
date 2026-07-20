import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Role } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

const mockPrisma = {
  client: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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

  describe('findAll()', () => {
    const pagination = { skip: 0, limit: 20, page: 1 } as PaginationDto;

    beforeEach(() => {
      mockPrisma.client.user.findMany.mockResolvedValue([{ ...baseUser }]);
      mockPrisma.client.user.count.mockResolvedValue(1);
    });

    it('returns a page of users alongside the total, so a table can paginate', async () => {
      mockPrisma.client.user.count.mockResolvedValue(57);

      const result = await service.findAll(pagination);

      expect(result.total).toBe(57);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].email).toBe('user@test.com');
    });

    it('asks the database for one page, not the whole table', async () => {
      await service.findAll({ skip: 40, limit: 20, page: 3 });

      expect(mockPrisma.client.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });

    it('never selects the password hash', async () => {
      await service.findAll(pagination);

      const calls = mockPrisma.client.user.findMany.mock.calls as [
        { select: Record<string, unknown> },
      ][];
      expect(calls[0][0].select.passwordHash).toBeUndefined();
    });

    describe('search', () => {
      it('matches on name or email, case-insensitively', async () => {
        await service.findAll(pagination, 'Steve');

        const where = {
          OR: [
            { name: { contains: 'Steve', mode: 'insensitive' } },
            { email: { contains: 'Steve', mode: 'insensitive' } },
          ],
        };
        expect(mockPrisma.client.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where }),
        );
        // The total has to reflect the same filter, or the pager promises
        // pages that don't exist.
        expect(mockPrisma.client.user.count).toHaveBeenCalledWith({ where });
      });

      it('filters nothing when no search term is given', async () => {
        await service.findAll(pagination);

        expect(mockPrisma.client.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: {} }),
        );
        expect(mockPrisma.client.user.count).toHaveBeenCalledWith({
          where: {},
        });
      });

      it('treats a blank search as no search', async () => {
        await service.findAll(pagination, '   ');

        expect(mockPrisma.client.user.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: {} }),
        );
      });
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
      expect(mockPrisma.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { xp: { increment: 50 } } }),
      );
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

  describe('changeRole()', () => {
    it('promotes another user and records the change', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({
        ...baseUser,
        role: Role.USER,
      });
      mockPrisma.client.user.update.mockResolvedValue({
        ...baseUser,
        role: Role.ADMIN,
      });

      const result = await service.changeRole(
        'cadmin',
        'ctest1',
        Role.ADMIN,
        '203.0.113.7',
      );

      expect(result.role).toBe(Role.ADMIN);
      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.USER_ROLE_CHANGE,
        targetType: 'User',
        targetId: 'ctest1',
        metadata: { from: Role.USER, to: Role.ADMIN },
        ip: '203.0.113.7',
      });
    });

    // Otherwise the last admin can demote themselves and lock everyone out of
    // the panel — with no way back in short of a manual database edit.
    it('refuses to let an admin change their own role', async () => {
      await expect(
        service.changeRole('cadmin', 'cadmin', Role.USER),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.client.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown target', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      await expect(
        service.changeRole('cadmin', 'cghost', Role.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('rolls the change back when the audit write fails', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      mockPrisma.client.adminAction.create.mockRejectedValueOnce(
        new Error('log down'),
      );

      await expect(
        service.changeRole('cadmin', 'ctest1', Role.ADMIN),
      ).rejects.toThrow('log down');
    });
  });

  describe('adjustBalance()', () => {
    beforeEach(() => {
      mockPrisma.client.user.findUnique.mockResolvedValue({
        ...baseUser,
        coins: 100,
        gems: 10,
      });
      mockPrisma.client.user.update.mockResolvedValue({
        ...baseUser,
        coins: 150,
        gems: 10,
      });
    });

    // A delta, not a new total: two admins adjusting at once must both land,
    // rather than the second silently overwriting the first.
    it('applies the change as an increment, not an overwrite', async () => {
      await service.adjustBalance('cadmin', 'ctest1', { coins: 50 });

      expect(mockPrisma.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { coins: { increment: 50 } } }),
      );
    });

    it('records the adjustment with the before and after', async () => {
      await service.adjustBalance(
        'cadmin',
        'ctest1',
        { coins: 50 },
        '198.51.100.9',
      );

      expect(auditRow()).toMatchObject({
        actorId: 'cadmin',
        action: AdminActionType.USER_BALANCE_CHANGE,
        targetId: 'ctest1',
        metadata: {
          coins: { from: 100, delta: 50, to: 150 },
        },
        ip: '198.51.100.9',
      });
    });

    it('deducts on a negative delta', async () => {
      await service.adjustBalance('cadmin', 'ctest1', { gems: -5 });

      expect(mockPrisma.client.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { gems: { increment: -5 } } }),
      );
    });

    // A negative balance is not a state the shop or the profile can mean
    // anything sensible about.
    it('refuses a deduction that would overdraw the balance', async () => {
      await expect(
        service.adjustBalance('cadmin', 'ctest1', { coins: -101 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.client.user.update).not.toHaveBeenCalled();
    });

    it('allows a deduction down to exactly zero', async () => {
      await service.adjustBalance('cadmin', 'ctest1', { coins: -100 });
      expect(mockPrisma.client.user.update).toHaveBeenCalled();
    });

    it('refuses an adjustment that changes nothing', async () => {
      await expect(
        service.adjustBalance('cadmin', 'ctest1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for an unknown target', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      await expect(
        service.adjustBalance('cadmin', 'cghost', { coins: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rolls the adjustment back when the audit write fails', async () => {
      mockPrisma.client.adminAction.create.mockRejectedValueOnce(
        new Error('log down'),
      );

      await expect(
        service.adjustBalance('cadmin', 'ctest1', { coins: 50 }),
      ).rejects.toThrow('log down');
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
