import type { CookieOptions } from 'express';

export const COOKIE_NAMES = {
  access: 'pc_access',
  refresh: 'pc_refresh',
  csrf: 'pc_csrf',
  user: 'pc_user',
} as const;

export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// `secure` only in production: browsers reject Secure cookies over plain
// http://localhost in dev. `path: '/'` because the browser reaches this API
// through the frontend's /api proxy prefix, which the backend never sees — a
// narrower path would stop the cookie from ever being sent back.
function base(maxAge: number): CookieOptions {
  return {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge,
  };
}

/** For tokens: invisible to JavaScript, so XSS cannot exfiltrate them. */
export function authCookieOptions(maxAge: number): CookieOptions {
  return { ...base(maxAge), httpOnly: true };
}

/** For values the client must read (CSRF token, display-only user info). */
export function readableCookieOptions(maxAge: number): CookieOptions {
  return { ...base(maxAge), httpOnly: false };
}
