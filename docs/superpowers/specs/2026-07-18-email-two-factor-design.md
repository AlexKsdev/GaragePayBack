# Email-based Two-Factor for Login (KAN-67)

**Status:** implemented, pre-merge
**Repo:** MinecraftBack
**Jira:** KAN-67
**Migration:** `20260718164029_add_two_factor_method` (applied to Neon)

## Goal

Let an account prove the second factor with a code **emailed at login** instead of
an authenticator app. Motivation: TOTP is unusable when the host clock is skewed
from real time (a 2026-dated dev box vs a real-time phone), which makes every
authenticator code look wrong.

## Design

A per-user 2FA **channel**, not a replacement:

- `User.twoFactorMethod: TwoFactorMethod (TOTP | EMAIL)`, default `TOTP`. Only
  meaningful when `totpEnabled` (the "2FA on" flag) is true. `AdminGuard` still
  keys off `totpEnabled`, so an email-2FA admin passes it with `totpSecret = null`.
- **No OTP columns.** The emailed code's **bcrypt hash rides inside the signed,
  httpOnly `pending2fa` JWT**, so it can't be forged or read-modified by the
  client and it expires with the token (5 min). The plaintext code exists only in
  the email.

### Flow

1. `POST /auth/login` (password OK, `totpEnabled`): `startTwoFactorLogin(user)` —
   - EMAIL: generate a crypto-random 6-digit code, email it via `MailService`,
     mint a `pending2fa` token carrying `codeHash`.
   - TOTP: mint the token, no code.
   Returns `{ twoFactorRequired: true }` + the pending cookie, unchanged shape.
2. `POST /auth/2fa/verify` — `verifyTwoFactorLogin` branches on the user's method:
   EMAIL → `bcrypt.compare(code, codeHash)`; TOTP → `totp.verify`. Same
   `AUTH_INVALID_CODE` tag on failure (generic, no enumeration).
3. `POST /auth/2fa/resend` — re-issues an email code against a still-valid pending
   session; throttled **3/min** (tighter than verify's 10/min) so it can't be an
   email-spam lever.

### Security notes (per docs/security.md)

- Code is bcrypt-hashed (cost 10); never logged; delivered only by email.
- The pending cookie is httpOnly + 5-min TTL + single-use; brute-force is online
  only and throttled. Offline brute-force would first require stealing the
  httpOnly cookie.
- Input via `TwoFactorCodeDto` (`/^\d{6}$/`); generic failure messages.

## Files

- `prisma/schema.prisma` — `TwoFactorMethod` enum + `User.twoFactorMethod`.
- `auth.service.ts` — `startTwoFactorLogin`, `resendTwoFactorCode`,
  `generateEmailCode`, `readPending2faToken` (extracted), `signPending2faToken`
  gains an optional `codeHash`, `verifyTwoFactorLogin` branches by method.
- `auth.controller.ts` — login uses `startTwoFactorLogin`; new `POST /auth/2fa/resend`.
- `mail.service.ts` — `sendTwoFactorCode(email, code)`.
- `auth.service.spec.ts` — 5 new tests (start emails/returns token, TOTP sends
  nothing, verify accepts the emailed code, wrong code → invalidCode, resend).

## Delivery constraint

`RESEND_FROM_EMAIL="onboarding@resend.dev"` is the Resend sandbox — it delivers
only to the Resend account owner (`blojs.lj@gmail.com`) until a domain is
verified. So the email-2FA admin must use that address to actually receive codes.

## Out of scope

- Frontend copy still says "authenticator app" on the 2FA login screen; it's
  functional for email codes (same 6-digit entry). A "Resend code" button + copy
  tweak is a small follow-up.
- Self-service UI to switch a user's method (set directly for the admin for now).
