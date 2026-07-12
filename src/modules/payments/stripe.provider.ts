import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

/**
 * Provides a singleton Stripe client. The secret key comes from the env; a
 * placeholder keeps the app bootable when Stripe isn't configured yet (real
 * API calls then fail loudly with an auth error rather than crashing startup).
 */
export const stripeProvider = {
  provide: STRIPE_CLIENT,
  useFactory: (): Stripe =>
    new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_unconfigured'),
};
