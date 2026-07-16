// How long a fresh re-auth stays good for. Long enough to carry out a few
// destructive actions in one sitting, short enough that a walked-away-from
// session cannot be used to do them hours later.
export const STEP_UP_TTL_MS = 5 * 60 * 1000;

// Marks a token as "just re-proved a factor". A session token never carries
// this, and StepUpGuard accepts nothing without it, so an access token can
// never stand in for a step-up.
export const STEP_UP_PURPOSE = 'stepup';
