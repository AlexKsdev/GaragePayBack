/**
 * Icons a category may use. Stored by name; the client maps each to its icon
 * component. Constrained to a list so a typo can't render nothing.
 */
export const WIKI_ICONS = [
  'Home',
  'Pickaxe',
  'Swords',
  'Shield',
  'Users',
  'Zap',
  'BookMarked',
  'Map',
  'Settings',
  'HelpCircle',
] as const;

export type WikiIcon = (typeof WIKI_ICONS)[number];

/** Accents a category card may use, mirrored by the client's palette. */
export const WIKI_ACCENTS = [
  'primary',
  'amber',
  'red',
  'sky',
  'purple',
  'yellow',
] as const;

export type WikiAccent = (typeof WIKI_ACCENTS)[number];
