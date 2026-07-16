import type { CookieOptions } from 'express';

export const COOKIE_NAMES = {
  access: 'pc_access',
  refresh: 'pc_refresh',
  csrf: 'pc_csrf',
  user: 'pc_user',
  // Half-finished login: password accepted, TOTP code still owed. Read only by
  // /auth/2fa/verify. Deliberately a separate cookie from `access` — the JWT
  // strategy reads `access` alone, so this can never authenticate anything.
  pending2fa: 'pc_2fa',
  // Proof that a factor was re-entered just now. Read only by StepUpGuard, and
  // separate from `access` for the same reason as pending2fa: it grants no
  // session on its own, it only unlocks destructive actions for a short while.
  stepUp: 'pc_stepup',
} as const;

export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// `secure` everywhere except local development: browsers reject Secure cookies
// over plain http://localhost, but any other deployment (staging included) is
// HTTPS and must not ship session cookies in the clear.
//
// `sameSite: 'lax'` rather than 'strict': Strict withholds cookies on *every*
// cross-site request including top-level navigations, which would land users on
// /checkout/success (returning from Stripe) and on reset-password email links
// logged out. Lax still withholds them on cross-site POST/fetch — the CSRF
// vector — and the double-submit token guard is the actual defence.
//
// `path: '/'` because the browser reaches this API through the frontend's /api
// proxy prefix, which the backend never sees — a narrower path would stop the
// cookie from ever being sent back.
function base(maxAge: number): CookieOptions {
  return {
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
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
