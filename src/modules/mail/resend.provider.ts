import { Resend } from 'resend';

export const RESEND_CLIENT = 'RESEND_CLIENT';

/**
 * Provides a singleton Resend client. A placeholder key keeps the app
 * bootable when Resend isn't configured yet (real sends then fail loudly
 * with an auth error rather than crashing startup) — same pattern as the
 * Stripe client provider.
 */
export const resendProvider = {
  provide: RESEND_CLIENT,
  useFactory: (): Resend =>
    new Resend(process.env.RESEND_API_KEY ?? 're_unconfigured'),
};
