import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** Whether the user is an admin, checked against the database (not a JWT claim). */
export async function isAdmin(
  prisma: PrismaService,
  userId: string,
): Promise<boolean> {
  const user = await prisma.client.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role === Role.ADMIN;
}

/**
 * Row-level authorization: allow the action only when the requester owns the
 * resource or is an admin. Admin status is verified against the DB so a demoted
 * user cannot keep acting on a still-valid JWT role claim. Owner checks need no
 * DB round-trip.
 */
export async function assertOwnerOrAdmin(
  prisma: PrismaService,
  requesterId: string,
  ownerId: string,
  message = 'Forbidden',
): Promise<void> {
  if (requesterId === ownerId) return;
  if (!(await isAdmin(prisma, requesterId))) {
    throw new ForbiddenException(message);
  }
}
