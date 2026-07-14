import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

/**
 * Row-level authorization: allow the action only when the requester owns the
 * resource or is an admin. Role guards handle route-level access; this handles
 * "can this user touch *this* record".
 */
export function assertOwnerOrAdmin(
  requesterId: string,
  ownerId: string,
  role: Role,
  message = 'Forbidden',
): void {
  if (requesterId !== ownerId && role !== Role.ADMIN) {
    throw new ForbiddenException(message);
  }
}
