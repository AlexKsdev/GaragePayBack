import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CsrfGuard } from './csrf.guard';

const mockReflector = { getAllAndOverride: jest.fn() };

function buildContext(
  method: string,
  cookieToken?: string,
  headerToken?: string,
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        cookies: cookieToken ? { pc_csrf: cookieToken } : {},
        headers: headerToken ? { 'x-csrf-token': headerToken } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  let guard: CsrfGuard;

  beforeEach(() => {
    guard = new CsrfGuard(mockReflector as unknown as Reflector);
    mockReflector.getAllAndOverride.mockReturnValue(false);
  });

  afterEach(() => jest.clearAllMocks());

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows safe method %s', (method) => {
    expect(guard.canActivate(buildContext(method))).toBe(true);
  });

  it('allows a route marked @SkipCsrf()', () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(buildContext('POST'))).toBe(true);
  });

  it('allows a mutation whose header matches the cookie', () => {
    expect(guard.canActivate(buildContext('POST', 'tok123', 'tok123'))).toBe(
      true,
    );
  });

  it('rejects a mutation with no CSRF cookie', () => {
    expect(() =>
      guard.canActivate(buildContext('POST', undefined, 'tok')),
    ).toThrow(ForbiddenException);
  });

  it('rejects a mutation with no header', () => {
    expect(() => guard.canActivate(buildContext('POST', 'tok123'))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a mutation whose header does not match the cookie', () => {
    expect(() =>
      guard.canActivate(buildContext('DELETE', 'tok123', 'wrong')),
    ).toThrow(ForbiddenException);
  });
});
