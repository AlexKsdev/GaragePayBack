import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Locale, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AdminWikiCategoryDto,
  AdminWikiArticleDto,
  WikiArticleDetailDto,
  WikiArticleListItemDto,
  WikiCategoryDto,
} from './dto/wiki-response.dto';
import {
  CreateWikiArticleDto,
  CreateWikiCategoryDto,
  UpdateWikiArticleDto,
  UpdateWikiCategoryDto,
} from './dto/upsert-wiki.dto';

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

/** Fields an update may change directly; `published` has its own endpoint. */
const EDITABLE_ARTICLE_FIELDS = ['slug', 'categoryId', 'sortOrder'] as const;
const EDITABLE_CATEGORY_FIELDS = [
  'key',
  'icon',
  'accent',
  'sortOrder',
] as const;

/**
 * Only what actually moved. An edit form posts the whole object, so most fields
 * arrive defined but identical — filtering on `undefined` alone would have the
 * log claim four changes for a single sortOrder edit.
 */
function changedFields<K extends string>(
  fields: readonly K[],
  dto: Partial<Record<K, unknown>>,
  current: Partial<Record<K, unknown>>,
): K[] {
  return fields.filter((f) => dto[f] !== undefined && dto[f] !== current[f]);
}

/** The subset of `fields` the caller actually sent, ready to hand to Prisma. */
function definedFields<K extends string>(
  fields: readonly K[],
  dto: Partial<Record<K, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    fields.filter((f) => dto[f] !== undefined).map((f) => [f, dto[f]]),
  );
}

@Injectable()
export class WikiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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

  /* ── Admin ── */

  /**
   * Drafts included and empty categories kept: a draft has to be findable to be
   * finished, and an empty category has to be visible to put the first article
   * in it. Both are the opposite of what the public listing wants.
   */
  findAllForAdmin(): Promise<AdminWikiCategoryDto[]> {
    return this.prisma.client.wikiCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        translations: { select: CATEGORY_TRANSLATION_SELECT },
        articles: {
          orderBy: { sortOrder: 'asc' },
          include: { translations: { select: ARTICLE_TRANSLATION_SELECT } },
        },
      },
    });
  }

  async createCategory(
    actorId: string,
    dto: CreateWikiCategoryDto,
    ip?: string,
  ): Promise<AdminWikiCategoryDto> {
    // `key` is unique — a clear 409 beats a raw constraint violation as a 500.
    const clash = await this.prisma.client.wikiCategory.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Category key already in use');

    const { translations, ...category } = dto;

    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.wikiCategory.create({
        data: { ...category, translations: { create: translations } },
        include: {
          translations: { select: CATEGORY_TRANSLATION_SELECT },
          articles: {
            include: { translations: { select: ARTICLE_TRANSLATION_SELECT } },
          },
        },
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.WIKI_CATEGORY_CREATE,
          targetType: 'WikiCategory',
          targetId: created.id,
          metadata: {
            key: dto.key,
            locales: translations.map((t) => t.locale),
          },
          ip,
        },
        tx,
      );
      return created;
    });
  }

  async updateCategory(
    actorId: string,
    id: string,
    dto: UpdateWikiCategoryDto,
    ip?: string,
  ): Promise<AdminWikiCategoryDto> {
    const current = await this.prisma.client.wikiCategory.findUnique({
      where: { id },
      include: { translations: { select: CATEGORY_TRANSLATION_SELECT } },
    });
    if (!current) throw new NotFoundException('Category not found');

    if (dto.key && dto.key !== current.key) {
      const clash = await this.prisma.client.wikiCategory.findUnique({
        where: { key: dto.key },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Category key already in use');
    }

    const changed = changedFields(EDITABLE_CATEGORY_FIELDS, dto, current);
    const locales = dto.translations?.map((t) => t.locale) ?? [];

    return this.prisma.client.$transaction(async (tx) => {
      const category = await tx.wikiCategory.update({
        where: { id },
        data: definedFields(EDITABLE_CATEGORY_FIELDS, dto),
        include: {
          translations: { select: CATEGORY_TRANSLATION_SELECT },
          articles: {
            orderBy: { sortOrder: 'asc' },
            include: { translations: { select: ARTICLE_TRANSLATION_SELECT } },
          },
        },
      });

      // Upsert rather than replace: a locale left out keeps its translation.
      for (const { locale, ...text } of dto.translations ?? []) {
        await tx.wikiCategoryTranslation.upsert({
          where: { categoryId_locale: { categoryId: id, locale } },
          create: { categoryId: id, locale, ...text },
          update: text,
        });
      }

      await this.audit.record(
        {
          actorId,
          action: AdminActionType.WIKI_CATEGORY_UPDATE,
          targetType: 'WikiCategory',
          targetId: id,
          metadata: { changed, ...(locales.length ? { locales } : {}) },
          ip,
        },
        tx,
      );
      return category;
    });
  }

  async createArticle(
    actorId: string,
    dto: CreateWikiArticleDto,
    ip?: string,
  ): Promise<AdminWikiArticleDto> {
    const clash = await this.prisma.client.wikiArticle.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Slug already in use');

    // The foreign key would reject this anyway; a 404 says which half was wrong.
    await this.requireCategory(dto.categoryId);

    const { translations, ...article } = dto;

    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.wikiArticle.create({
        data: {
          ...article,
          // Publishing is its own audited action, never a side effect.
          published: false,
          translations: { create: translations },
        },
        include: { translations: { select: ARTICLE_TRANSLATION_SELECT } },
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.WIKI_ARTICLE_CREATE,
          targetType: 'WikiArticle',
          targetId: created.id,
          metadata: {
            slug: dto.slug,
            categoryId: dto.categoryId,
            locales: translations.map((t) => t.locale),
          },
          ip,
        },
        tx,
      );
      return created;
    });
  }

  async updateArticle(
    actorId: string,
    id: string,
    dto: UpdateWikiArticleDto,
    ip?: string,
  ): Promise<AdminWikiArticleDto> {
    const current = await this.prisma.client.wikiArticle.findUnique({
      where: { id },
      include: { translations: { select: ARTICLE_TRANSLATION_SELECT } },
    });
    if (!current) throw new NotFoundException('Article not found');

    if (dto.slug && dto.slug !== current.slug) {
      const clash = await this.prisma.client.wikiArticle.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Slug already in use');
    }

    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      await this.requireCategory(dto.categoryId);
    }

    const changed = changedFields(EDITABLE_ARTICLE_FIELDS, dto, current);
    const locales = dto.translations?.map((t) => t.locale) ?? [];

    return this.prisma.client.$transaction(async (tx) => {
      const article = await tx.wikiArticle.update({
        where: { id },
        data: definedFields(EDITABLE_ARTICLE_FIELDS, dto),
        include: { translations: { select: ARTICLE_TRANSLATION_SELECT } },
      });

      for (const { locale, ...text } of dto.translations ?? []) {
        await tx.wikiArticleTranslation.upsert({
          where: { articleId_locale: { articleId: id, locale } },
          create: { articleId: id, locale, ...text },
          update: text,
        });
      }

      await this.audit.record(
        {
          actorId,
          action: AdminActionType.WIKI_ARTICLE_UPDATE,
          targetType: 'WikiArticle',
          targetId: id,
          metadata: { changed, ...(locales.length ? { locales } : {}) },
          ip,
        },
        tx,
      );
      return article;
    });
  }

  /**
   * Puts an article on the wiki or takes it off. Separate from `updateArticle`
   * because leaving `published` editable there would let a quiet field edit
   * publish an article while the log said WIKI_ARTICLE_UPDATE. Taking one down
   * is a flag, not a delete.
   */
  async setArticlePublished(
    actorId: string,
    id: string,
    published: boolean,
    ip?: string,
  ): Promise<AdminWikiArticleDto> {
    const current = await this.prisma.client.wikiArticle.findUnique({
      where: { id },
      select: { published: true, slug: true },
    });
    if (!current) throw new NotFoundException('Article not found');

    return this.prisma.client.$transaction(async (tx) => {
      const article = await tx.wikiArticle.update({
        where: { id },
        data: { published },
        include: { translations: { select: ARTICLE_TRANSLATION_SELECT } },
      });
      await this.audit.record(
        {
          actorId,
          // There is no PUBLISH action; a publish is an update with the flag's
          // before/after spelled out, so the movement is still readable.
          action: published
            ? AdminActionType.WIKI_ARTICLE_UPDATE
            : AdminActionType.WIKI_ARTICLE_UNPUBLISH,
          targetType: 'WikiArticle',
          targetId: id,
          metadata: published
            ? {
                changed: ['published'],
                published: { from: current.published, to: true },
              }
            : { slug: current.slug },
          ip,
        },
        tx,
      );
      return article;
    });
  }

  /** An article always belongs to a category — there is no loose article. */
  private async requireCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.client.wikiCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }
}
