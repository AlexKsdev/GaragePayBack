import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

const mockReflector = {
  getAllAndOverride: jest.fn(),
};

const buildContext = (role?: Role): ExecutionContext =>
  ({
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(mockReflector as unknown as Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows access when no roles are required', () => {
    mockReflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows access when user has the required role', () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(buildContext(Role.ADMIN))).toBe(true);
  });

  it('denies access when user role does not match', () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(buildContext(Role.USER))).toBe(false);
  });

  it('denies access when user is undefined', () => {
    mockReflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(buildContext())).toBe(false);
  });
});
