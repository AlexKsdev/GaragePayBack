/**
 * Accents an admin may pick for a post's tag chip. Stored by name; the client
 * maps each to its palette. Constrained to a list so a typo can't render an
 * unstyled chip.
 */
export const POST_TAG_ACCENTS = [
  'primary',
  'amber',
  'sky',
  'purple',
  'yellow',
] as const;

export type PostTagAccent = (typeof POST_TAG_ACCENTS)[number];

/**
 * Reading speed used to derive `readTimeMinutes` from the body. Storing the
 * string "4 min" would put English back in the database, which is what moving
 * the blog here was meant to stop.
 */
export const WORDS_READ_PER_MINUTE = 200;
