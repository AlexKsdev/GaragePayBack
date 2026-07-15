// Shown in the authenticator app next to the code.
export const TOTP_ISSUER = 'PureCraft';

// How long the half-finished login (password accepted, code still owed) stays
// valid. Long enough to open an authenticator app, short enough that a stolen
// pending cookie is near-useless.
export const PENDING_2FA_TTL_MS = 5 * 60 * 1000;
