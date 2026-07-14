import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertOwnerOrAdmin } from './ownership.util';

describe('assertOwnerOrAdmin', () => {
  it('allows the owner', () => {
    expect(() =>
      assertOwnerOrAdmin('user-1', 'user-1', Role.USER),
    ).not.toThrow();
  });

  it('allows an admin acting on another user', () => {
    expect(() =>
      assertOwnerOrAdmin('admin-1', 'user-2', Role.ADMIN),
    ).not.toThrow();
  });

  it('rejects a non-owner non-admin', () => {
    expect(() => assertOwnerOrAdmin('user-1', 'user-2', Role.USER)).toThrow(
      ForbiddenException,
    );
  });

  it('uses the provided message', () => {
    expect(() =>
      assertOwnerOrAdmin('user-1', 'user-2', Role.USER, 'Cannot touch this'),
    ).toThrow('Cannot touch this');
  });
});
