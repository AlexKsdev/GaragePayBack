import type { Request } from 'express';
import { fromCookie } from './jwt.strategy';

const asRequest = (cookies?: Record<string, string>): Request =>
  ({ cookies }) as unknown as Request;

describe('jwt.strategy fromCookie', () => {
  it('reads the token from the pc_access cookie', () => {
    expect(fromCookie(asRequest({ pc_access: 'jwt-token' }))).toBe('jwt-token');
  });

  it('returns null when there is no pc_access cookie', () => {
    expect(fromCookie(asRequest({ pc_csrf: 'other' }))).toBeNull();
  });

  it('returns null when cookies are absent entirely', () => {
    expect(fromCookie(asRequest(undefined))).toBeNull();
  });

  // The phase's core guarantee: a token presented any other way is ignored.
  it('ignores a token supplied via the Authorization header', () => {
    const req = {
      cookies: {},
      headers: { authorization: 'Bearer smuggled-token' },
    } as unknown as Request;
    expect(fromCookie(req)).toBeNull();
  });
});
