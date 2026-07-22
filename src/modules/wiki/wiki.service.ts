import { Injectable, NotFoundException } from '@nestjs/common';
import { Locale, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  WikiArticleDetailDto,
  WikiArticleListItemDto,
  WikiCategoryDto,
} from './dto/wiki-response.dto';

const ARTICLE_TRANSLATION_SELECT = {
  locale: true,
  title: true,
  summary: true,
  body: true,
} as const;

const CATEGORY_TRANSLATION_SELECT = {
  locale: true,
  title: true,
} as const;

type ArticleTranslation = {
  locale: Locale;
  title: string;
  summary: string;
  body: string;
};

type CategoryTranslation = { locale: Locale; title: string };

/**
 * Picks the row written in `locale`, falling back to English. Applied per row
 * rather than per request, so a translated category heading can sit above an
 * untranslated article instead of the reader losing both.
 */
function pick<T extends { locale: Locale }>(
  rows: T[],
  locale: Locale,
): T | undefined {
  return (
    rows.find((r) => r.locale === locale) ??
    rows.find((r) => r.locale === Locale.EN)
  );
}

@Injectable()
export class WikiService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(locale: Locale, q?: string): Promise<WikiCategoryDto[]> {
    const term = q?.trim();

    // The match runs across every language, while the render falls back
    // separately: someone reading /uk who types an English term still finds
    // the article.
    const where: Prisma.WikiArticleWhereInput = {
      published: true,
      ...(term
        ? {
            translations: {
              some: {
                OR: [
                  { title: { contains: term, mode: 'insensitive' } },
                  { summary: { contains: term, mode: 'insensitive' } },
                  { body: { contains: term, mode: 'insensitive' } },
                ],
              },
            },
          }
        : {}),
    };

    const categories = await this.prisma.client.wikiCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        translations: { select: CATEGORY_TRANSLATION_SELECT },
        articles: {
          where,
          orderBy: { sortOrder: 'asc' },
          include: { translations: { select: ARTICLE_TRANSLATION_SELECT } },
        },
      },
    });

    return categories
      .map((category) => {
        const heading = pick<CategoryTranslation>(
          category.translations,
          locale,
        );
        if (!heading) return null;

        const articles = category.articles
          .map((article) => {
            const text = pick<ArticleTranslation>(article.translations, locale);
            return text
              ? {
                  slug: article.slug,
                  title: text.title,
                  summary: text.summary,
                  locale: text.locale,
                }
              : null;
          })
          .filter((a): a is WikiArticleListItemDto => a !== null);

        // An empty card is noise: either nothing in it is published, or the
        // search matched none of it.
        if (articles.length === 0) return null;

        return {
          key: category.key,
          title: heading.title,
          icon: category.icon,
          accent: category.accent,
          locale: heading.locale,
          articles,
        };
      })
      .filter((c): c is WikiCategoryDto => c !== null);
  }

  async findOne(slug: string, locale: Locale): Promise<WikiArticleDetailDto> {
    const article = await this.prisma.client.wikiArticle.findFirst({
      where: { slug, published: true },
      include: {
        translations: { select: ARTICLE_TRANSLATION_SELECT },
        category: {
          include: { translations: { select: CATEGORY_TRANSLATION_SELECT } },
        },
      },
    });
    if (!article) throw new NotFoundException('Article not found');

    const text = pick<ArticleTranslation>(article.translations, locale);
    if (!text) throw new NotFoundException('Article not found');

    const heading = pick<CategoryTranslation>(
      article.category.translations,
      locale,
    );

    return {
      slug: article.slug,
      title: text.title,
      summary: text.summary,
      body: text.body,
      locale: text.locale,
      categoryKey: article.category.key,
      categoryTitle: heading?.title ?? article.category.key,
    };
  }
}
