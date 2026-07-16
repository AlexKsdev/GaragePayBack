import { AdminActionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService, type AuditWriter } from './audit.service';

const mockTx = {
  adminAction: { create: jest.fn() },
};

const mockPrisma = {
  client: {
    adminAction: { create: jest.fn() },
  },
};

type CreateCall = [{ data: Record<string, unknown> }];

function rowWrittenTo(writer: {
  adminAction: { create: jest.Mock };
}): Record<string, unknown> {
  const calls = writer.adminAction.create.mock.calls as CreateCall[];
  return calls[0][0].data;
}

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    service = new AuditService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordIfActingOnAnother()', () => {
    it('records when an admin acts on someone else', async () => {
      await service.recordIfActingOnAnother(
        {
          actorId: 'admin1',
          ownerId: 'victim1',
          action: AdminActionType.USER_DELETE,
          targetType: 'User',
          targetId: 'victim1',
          ip: '203.0.113.7',
        },
        mockTx,
      );

      expect(rowWrittenTo(mockTx)).toMatchObject({
        actorId: 'admin1',
        action: AdminActionType.USER_DELETE,
        targetType: 'User',
        targetId: 'victim1',
        ip: '203.0.113.7',
      });
    });

    // PATCH/DELETE /users/:id are owner-or-admin. Logging self-service edits
    // would bury the admin actions this table exists to surface.
    it('records nothing when the actor is the owner', async () => {
      await service.recordIfActingOnAnother(
        {
          actorId: 'user1',
          ownerId: 'user1',
          action: AdminActionType.USER_UPDATE,
          targetType: 'User',
          targetId: 'user1',
        },
        mockTx,
      );

      expect(mockTx.adminAction.create).not.toHaveBeenCalled();
    });
  });

  describe('record()', () => {
    it('writes through the transaction it is handed, not its own client', async () => {
      await service.record(
        {
          actorId: 'admin1',
          action: AdminActionType.PAYMENT_STATUS_UPDATE,
          targetType: 'Payment',
          targetId: 'pay1',
          metadata: { from: 'PENDING', to: 'REFUNDED' },
        },
        mockTx,
      );

      expect(rowWrittenTo(mockTx)).toMatchObject({
        actorId: 'admin1',
        targetId: 'pay1',
        metadata: { from: 'PENDING', to: 'REFUNDED' },
      });
      // Writing outside the caller's transaction would leave the log behind
      // when the mutation rolls back.
      expect(mockPrisma.client.adminAction.create).not.toHaveBeenCalled();
    });

    it('leaves ip null when the request had none to offer', async () => {
      await service.record(
        {
          actorId: 'admin1',
          action: AdminActionType.USER_UPDATE,
          targetType: 'User',
          targetId: 'u1',
        },
        mockTx,
      );

      expect(rowWrittenTo(mockTx).ip).toBeNull();
    });

    // Fail-closed: an admin mutation that cannot be recorded must not stand.
    // Swallowing the error here would hand an attacker unlogged actions simply
    // by breaking the log.
    it('propagates a failed log write so the caller rolls the mutation back', async () => {
      mockTx.adminAction.create.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.record(
          {
            actorId: 'admin1',
            action: AdminActionType.USER_DELETE,
            targetType: 'User',
            targetId: 'u1',
          },
          mockTx as unknown as AuditWriter,
        ),
      ).rejects.toThrow('db down');
    });
  });
});
