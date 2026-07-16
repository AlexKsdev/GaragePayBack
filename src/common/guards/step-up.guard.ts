import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthConfig } from '../../config/auth.config';
import { COOKIE_NAMES } from '../../config/cookie.config';
import { STEP_UP_PURPOSE } from '../../config/step-up.config';
import { AuthenticatedRequest } from '../types/authenticated-request.type';

/**
 * Demands a factor re-proved in the last few minutes, so that holding a live
 * session is not by itself enough to do something irreversible. Run after
 * JwtGuard — identity comes from the session, freshness from here.
 *
 * Two independent guards, deliberately: the token must carry the step-up
 * purpose *and* arrive in its own cookie that JwtStrategy never reads. Either
 * one alone would be a single refactor away from letting an access token
 * unlock destructive actions.
 */
@Injectable()
export class StepUpGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(AuthConfig) private readonly authConfig: AuthConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    if (!userId) throw new ForbiddenException('Re-authentication required');

    const token = (request.cookies as Record<string, string> | undefined)?.[
      COOKIE_NAMES.stepUp
    ];
    if (!token) throw new ForbiddenException('Re-authentication required');

    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwt.verify(token, { secret: this.authConfig.jwtSecret });
    } catch {
      // Expired or forged — same answer either way.
      throw new ForbiddenException('Re-authentication required');
    }

    if (payload.purpose !== STEP_UP_PURPOSE) {
      throw new ForbiddenException('Re-authentication required');
    }
    // Bound to the session it was minted for: one user's re-auth must not
    // unlock anything for another.
    if (payload.sub !== userId) {
      throw new ForbiddenException('Re-authentication required');
    }
    return true;
  }
}
