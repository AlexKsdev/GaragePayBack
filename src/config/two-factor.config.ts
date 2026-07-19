// How long a half-finished login (password accepted, email code still owed)
// stays valid. Long enough to fetch the code from email, short enough that a
// stolen pending cookie is near-useless.
export const PENDING_2FA_TTL_MS = 5 * 60 * 1000;

// Marks a token as "password done, code still owed". A session token never
// carries this, and /auth/2fa/verify accepts nothing without it — so the two
// kinds of token can never be swapped for one another.
export const PENDING_2FA_PURPOSE = '2fa';

// Enable/disable confirmation codes are emailed while the user is already
// authenticated; their hash rides in a short-lived, purpose-scoped token so a
// code minted to turn 2FA on can't be replayed to turn it off (or vice versa).
export const TWO_FA_ACTION_TTL_MS = 5 * 60 * 1000;
export const TWO_FA_ENABLE_PURPOSE = '2fa-enable';
export const TWO_FA_DISABLE_PURPOSE = '2fa-disable';
