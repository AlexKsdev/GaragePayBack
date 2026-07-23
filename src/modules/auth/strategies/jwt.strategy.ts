import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthConfig } from '../../../config/auth.config';
import { COOKIE_NAMES } from '../../../config/cookie.config';
import { JwtPayload } from '../../../common/types/jwt-payload.type';

/**
 * The only way a JWT enters this app. Deliberately cookie-only: there is no
 * Authorization-header fallback because no JavaScript can obtain a token any
 * more — that is the whole point of the httpOnly cookie phase.
 */
export function fromCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[COOKIE_NAMES.access] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(authConfig: AuthConfig) {
    super({
      jwtFromRequest: fromCookie,
      ignoreExpiration: false,
      secretOrKey: authConfig.jwtSecret,
    });
  }

  validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email, role: payload.role };
  }
}
