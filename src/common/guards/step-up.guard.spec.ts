import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthConfig } from '../../config/auth.config';
import { STEP_UP_PURPOSE } from '../../config/step-up.config';
import { StepUpGuard } from './step-up.guard';

const SECRET = 'test-secret-that-is-at-least-32-chars-long';
const authConfig = { jwtSecret: SECRET } as AuthConfig;
const jwt = new JwtService();

function buildContext(userId?: string, cookie?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: userId ? { id: userId } : undefined,
        cookies: cookie ? { pc_stepup: cookie } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

function stepUpToken(sub: string, overrides: object = {}): string {
  return jwt.sign(
    { sub, purpose: STEP_UP_PURPOSE, ...overrides },
    { secret: SECRET, expiresIn: 300 },
  );
}

describe('StepUpGuard', () => {
  let guard: StepUpGuard;

  beforeEach(() => {
    guard = new StepUpGuard(jwt, authConfig);
  });

  it('admits a fresh step-up token belonging to the caller', () => {
    const ctx = buildContext('cuser1', stepUpToken('cuser1'));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects when no step-up cookie is present', () => {
    expect(() => guard.canActivate(buildContext('cuser1'))).toThrow(
      ForbiddenException,
    );
  });

  // The whole point of the separate cookie + claim: holding a session must not
  // be enough to perform a destructive action.
  it('refuses a normal access token presented as a step-up', () => {
    const access = jwt.sign(
      { sub: 'cuser1', email: 'a@b.com' },
      { secret: SECRET, expiresIn: 300 },
    );
    expect(() => guard.canActivate(buildContext('cuser1', access))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a token carrying some other purpose', () => {
    const pending = stepUpToken('cuser1', { purpose: '2fa' });
    expect(() => guard.canActivate(buildContext('cuser1', pending))).toThrow(
      ForbiddenException,
    );
  });

  // Otherwise one user's re-auth would unlock destructive actions for another.
  it('refuses a valid step-up token minted for somebody else', () => {
    const ctx = buildContext('cuser1', stepUpToken('cattacker'));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('refuses an expired step-up token', () => {
    const expired = jwt.sign(
      { sub: 'cuser1', purpose: STEP_UP_PURPOSE },
      { secret: SECRET, expiresIn: -1 },
    );
    expect(() => guard.canActivate(buildContext('cuser1', expired))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a token signed with the wrong secret', () => {
    const forged = jwt.sign(
      { sub: 'cuser1', purpose: STEP_UP_PURPOSE },
      { secret: 'another-secret-that-is-also-32-chars-x', expiresIn: 300 },
    );
    expect(() => guard.canActivate(buildContext('cuser1', forged))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses when the request carries no authenticated user', () => {
    expect(() =>
      guard.canActivate(buildContext(undefined, stepUpToken('cuser1'))),
    ).toThrow(ForbiddenException);
  });
});
