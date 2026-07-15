import { SetMetadata } from '@nestjs/common';

export const SKIP_CSRF_KEY = 'skipCsrf';

/** Opt a route out of CSRF: server-to-server callers and pre-session routes. */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
