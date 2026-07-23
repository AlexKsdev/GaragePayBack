// Frontend origin(s) come from the comma-separated FRONTEND_URL env var. The
// full list is used for CORS; the first entry is the canonical base URL used
// to build user-facing links (reset-password, Stripe redirect targets).
const DEFAULT_FRONTEND_URL = 'http://localhost:3001';

/** All allowed frontend origins, for CORS. */
export function frontendOrigins(): string[] {
  return process.env.FRONTEND_URL?.split(',') ?? [DEFAULT_FRONTEND_URL];
}

/** The canonical frontend base URL, for building links back to the app. */
export function frontendBaseUrl(): string {
  return frontendOrigins()[0];
}
