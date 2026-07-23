import { Injectable } from '@nestjs/common';
import type { AdminActionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * The slice of the client this service needs — satisfied by both the Prisma
 * client and a `$transaction` handle, so callers can keep the log inside the
 * same transaction as the mutation it describes.
 */
export interface AuditWriter {
  adminAction: {
    create(args: { data: Prisma.AdminActionUncheckedCreateInput }): unknown;
  };
}

export interface AuditEntry {
  actorId: string;
  action: AdminActionType;
  targetType: string;
  targetId: string;
  /** What changed. Never secrets — this table is read by humans during incidents. */
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}

/** An entry whose target has an owner, so self-service can be told from admin action. */
export interface OwnedAuditEntry extends AuditEntry {
  ownerId: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends one row. Pass the caller's transaction so a mutation that rolls
   * back takes its log entry with it — and, more importantly, so a mutation
   * whose log cannot be written does not stand.
   */
  async record(entry: AuditEntry, writer: AuditWriter = this.prisma.client) {
    await writer.adminAction.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
        ip: entry.ip ?? null,
      },
    });
  }

  /**
   * Records only when the actor is someone other than the owner. The
   * owner-or-admin endpoints are used overwhelmingly by users editing their own
   * account; logging those would drown the admin actions this table exists for.
   */
  async recordIfActingOnAnother(
    entry: OwnedAuditEntry,
    writer: AuditWriter = this.prisma.client,
  ) {
    if (entry.actorId === entry.ownerId) return;
    await this.record(entry, writer);
  }
}
