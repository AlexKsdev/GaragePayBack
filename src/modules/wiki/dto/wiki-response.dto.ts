import { Locale } from '@prisma/client';

/** An article as the category card lists it — no body, so the listing stays small. */
export class WikiArticleListItemDto {
  slug: string;
  title: string;
  summary: string;

  /**
   * The locale actually rendered. Differs from the requested one when only the
   * English text exists, so the client can tell a gap from a translation.
   */
  locale: Locale;
}

export class WikiCategoryDto {
  key: string;
  title: string;
  icon: string;
  accent: string;
  locale: Locale;
  articles: WikiArticleListItemDto[];
}

export class WikiArticleDetailDto extends WikiArticleListItemDto {
  /** Markdown. */
  body: string;

  /** So the article page can show where it sits and link back. */
  categoryKey: string;
  categoryTitle: string;
}

/* ── Admin shapes: every translation, drafts included ── */

export class AdminWikiCategoryTranslationDto {
  locale: Locale;
  title: string;
}

export class AdminWikiArticleTranslationDto {
  locale: Locale;
  title: string;
  summary: string;
  body: string;
}

export class AdminWikiArticleDto {
  id: string;
  slug: string;
  categoryId: string;
  published: boolean;
  sortOrder: number;
  createdAt: Date;
  translations: AdminWikiArticleTranslationDto[];
}

export class AdminWikiCategoryDto {
  id: string;
  key: string;
  icon: string;
  accent: string;
  sortOrder: number;
  translations: AdminWikiCategoryTranslationDto[];
  articles: AdminWikiArticleDto[];
}
