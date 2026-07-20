import { Locale } from '@prisma/client';

/** One post as the blog list shows it — no body, so the list stays small. */
export class PostListItemDto {
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  tag: string;
  tagAccent: string;
  author: string;
  publishedAt: Date;
  readTimeMinutes: number;

  /**
   * The locale actually rendered. Differs from the requested one when only the
   * English translation exists, so the client can mark the post accordingly
   * instead of silently claiming it is translated.
   */
  locale: Locale;
}

export class PostDetailDto extends PostListItemDto {
  /** Markdown. */
  body: string;
}

/** Every translation of a post, which is what the admin form edits. */
export class AdminPostTranslationDto {
  locale: Locale;
  title: string;
  excerpt: string;
  body: string;
}

export class AdminPostDto {
  id: string;
  slug: string;
  image: string;
  tag: string;
  tagAccent: string;
  author: string;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  translations: AdminPostTranslationDto[];
}
