import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminActionType, Locale, Prisma } from '@prisma/client';
import { WORDS_READ_PER_MINUTE } from '../../config/blog.config';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AdminPostDto,
  PostDetailDto,
  PostListItemDto,
} from './dto/post-response.dto';
import { CreatePostDto, UpdatePostDto } from './dto/upsert-post.dto';

const TRANSLATION_SELECT = {
  locale: true,
  title: true,
  excerpt: true,
  body: true,
} as const;

const POST_SELECT = {
  id: true,
  slug: true,
  image: true,
  tag: true,
  tagAccent: true,
  author: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  translations: { select: TRANSLATION_SELECT },
} as const;

type PostRow = Prisma.PostGetPayload<{ select: typeof POST_SELECT }>;
type TranslationRow = PostRow['translations'][number];

/** Fields an update may change directly; `published` has its own endpoint. */
const EDITABLE_FIELDS = [
  'slug',
  'image',
  'tag',
  'tagAccent',
  'author',
] as const;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(locale: Locale): Promise<PostListItemDto[]> {
    const posts = await this.prisma.client.post.findMany({
      where: { published: true },
      select: POST_SELECT,
      orderBy: { publishedAt: 'desc' },
    });

    return posts
      .map((post) => this.render(post, locale))
      .filter((post): post is PostDetailDto => post !== null)
      .map((post) => {
        // The list renders excerpts; shipping every body would send the whole
        // blog down the wire to draw seven cards.
        const { body, ...item } = post;
        void body;
        return item;
      });
  }

  async findOne(slug: string, locale: Locale): Promise<PostDetailDto> {
    const post = await this.prisma.client.post.findFirst({
      where: { slug, published: true },
      select: POST_SELECT,
    });

    const rendered = post && this.render(post, locale);
    if (!rendered) throw new NotFoundException('Post not found');
    return rendered;
  }

  /** Drafts included: a post has to be findable to be finished. */
  findAllForAdmin(): Promise<AdminPostDto[]> {
    return this.prisma.client.post.findMany({
      select: POST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    actorId: string,
    dto: CreatePostDto,
    ip?: string,
  ): Promise<AdminPostDto> {
    // The slug is the blog URL and the column is unique — a clear 409 beats a
    // raw constraint violation surfacing as a 500.
    const clash = await this.prisma.client.post.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });
    if (clash) throw new ConflictException('Slug already in use');

    const { translations, ...post } = dto;

    // One transaction: two tables plus the audit row, and a post with half its
    // translations written is not a state worth being able to reach.
    return this.prisma.client.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          ...post,
          // Publishing is its own audited action, never a side effect of create.
          published: false,
          translations: { create: translations },
        },
        select: POST_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          action: AdminActionType.POST_CREATE,
          targetType: 'Post',
          targetId: created.id,
          metadata: {
            slug: dto.slug,
            locales: translations.map((t) => t.locale),
          },
          ip,
        },
        tx,
      );
      return created;
    });
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdatePostDto,
    ip?: string,
  ): Promise<AdminPostDto> {
    const current = await this.prisma.client.post.findUnique({
      where: { id },
      select: POST_SELECT,
    });
    if (!current) throw new NotFoundException('Post not found');

    if (dto.slug && dto.slug !== current.slug) {
      const clash = await this.prisma.client.post.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Slug already in use');
    }

    // Only what actually moved. An edit form posts the whole object, so most
    // fields arrive defined but identical — filtering on `undefined` alone
    // would have the log claim five changes for a single tag edit.
    const changed = EDITABLE_FIELDS.filter(
      (field) => dto[field] !== undefined && dto[field] !== current[field],
    );
    const locales = dto.translations?.map((t) => t.locale) ?? [];

    return this.prisma.client.$transaction(async (tx) => {
      const post = await tx.post.update({
        where: { id },
        data: Object.fromEntries(
          EDITABLE_FIELDS.filter((f) => dto[f] !== undefined).map((f) => [
            f,
            dto[f],
          ]),
        ),
        select: POST_SELECT,
      });

      // Upsert rather than replace: a locale left out of the payload keeps its
      // translation, so editing the English copy cannot wipe the Ukrainian one.
      for (const { locale, ...text } of dto.translations ?? []) {
        await tx.postTranslation.upsert({
          where: { postId_locale: { postId: id, locale } },
          create: { postId: id, locale, ...text },
          update: text,
        });
      }

      await this.audit.record(
        {
          actorId,
          action: AdminActionType.POST_UPDATE,
          targetType: 'Post',
          targetId: id,
          metadata: { changed, ...(locales.length ? { locales } : {}) },
          ip,
        },
        tx,
      );
      return post;
    });
  }

  /**
   * Puts a post on the blog or takes it off. Separate from `update()` because
   * leaving `published` editable there would let a quiet field edit publish an
   * article while the log said POST_UPDATE. Taking a post down is a flag, not a
   * delete, so a mistaken unpublish costs a click rather than the article.
   */
  async setPublished(
    actorId: string,
    id: string,
    published: boolean,
    ip?: string,
  ): Promise<AdminPostDto> {
    const current = await this.prisma.client.post.findUnique({
      where: { id },
      select: { published: true, publishedAt: true, slug: true },
    });
    if (!current) throw new NotFoundException('Post not found');

    // Stamped once, on the first publish. Re-publishing is not re-dating: the
    // article keeps the day it actually ran.
    const firstPublish = published && current.publishedAt === null;

    return this.prisma.client.$transaction(async (tx) => {
      const post = await tx.post.update({
        where: { id },
        data: {
          published,
          ...(firstPublish ? { publishedAt: new Date() } : {}),
        },
        select: POST_SELECT,
      });
      await this.audit.record(
        {
          actorId,
          // There is no PUBLISH action; a publish is an update with the flag's
          // before/after spelled out, so the movement is still readable.
          action: published
            ? AdminActionType.POST_UPDATE
            : AdminActionType.POST_UNPUBLISH,
          targetType: 'Post',
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
      return post;
    });
  }

  /**
   * Flattens a post to the requested language, falling back to English so a
   * half-translated post is visible rather than a 404 — an untranslated post is
   * a content gap, not an error. Null only when nothing at all is written.
   */
  private render(post: PostRow, locale: Locale): PostDetailDto | null {
    const text: TranslationRow | undefined =
      post.translations.find((t) => t.locale === locale) ??
      post.translations.find((t) => t.locale === Locale.EN);
    if (!text) return null;

    return {
      slug: post.slug,
      title: text.title,
      excerpt: text.excerpt,
      body: text.body,
      image: post.image,
      tag: post.tag,
      tagAccent: post.tagAccent,
      author: post.author,
      publishedAt: post.publishedAt!,
      readTimeMinutes: readTime(text.body),
      locale: text.locale,
    };
  }
}

/** At least a minute — "0 min read" reads like a bug, not a short article. */
function readTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_READ_PER_MINUTE));
}
