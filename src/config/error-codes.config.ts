/**
 * Stable, machine-readable identities for the auth errors a user actually sees
 * in a form. The client maps these to localized text — the `message` beside
 * them is an English fallback for logs and unmapped clients, not the UI copy.
 *
 * Codes are API surface: rename one and a translated message silently reverts
 * to English on the client.
 */
export const AUTH_ERROR_CODES = {
  invalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  emailInUse: 'AUTH_EMAIL_IN_USE',
  invalidCode: 'AUTH_INVALID_CODE',
  twoFactorSessionExpired: 'AUTH_2FA_SESSION_EXPIRED',
  twoFactorSessionInvalid: 'AUTH_2FA_SESSION_INVALID',
  twoFactorNotEnabled: 'AUTH_2FA_NOT_ENABLED',
  twoFactorAlreadyEnabled: 'AUTH_2FA_ALREADY_ENABLED',
  twoFactorSetupMissing: 'AUTH_2FA_SETUP_MISSING',
  resetTokenInvalid: 'AUTH_RESET_TOKEN_INVALID',
  userNotFound: 'AUTH_USER_NOT_FOUND',
  accountDisabled: 'AUTH_ACCOUNT_DISABLED',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/**
 * Builds the exception body carrying both a code and a fallback message.
 * Nest passes this object straight to the response, and the shared filter
 * lifts `code` into the error envelope.
 */
export function authError(
  code: AuthErrorCode,
  message: string,
): { message: string; code: AuthErrorCode } {
  return { message, code };
}

export const QUEST_ERROR_CODES = {
  notFound: 'QUEST_NOT_FOUND',
  notComplete: 'QUEST_NOT_COMPLETE',
  alreadyClaimed: 'QUEST_ALREADY_CLAIMED',
} as const;

export type QuestErrorCode =
  (typeof QUEST_ERROR_CODES)[keyof typeof QUEST_ERROR_CODES];

export function questError(
  code: QuestErrorCode,
  message: string,
): { message: string; code: QuestErrorCode } {
  return { message, code };
}
