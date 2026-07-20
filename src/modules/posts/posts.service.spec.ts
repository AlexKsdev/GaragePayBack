import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminActionType, Locale } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PostsService } from './posts.service';

const mockPrisma = {
  client: {
    post: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    postTranslation: {
      upsert: jest.fn(),
    },
    adminAction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
};

// Hands the callback the client itself, so `tx.post.update` is the same mock
// the assertions below already watch.
mockPrisma.client.$transaction.mockImplementation((cb: unknown) =>
  (cb as (tx: unknown) => unknown)(mockPrisma.client),
);

/** The row the service wrote to the audit log, or undefined if it wrote none. */
function auditRow(): Record<string, unknown> | undefined {
  const calls = mockPrisma.client.adminAction.create.mock.calls as [
    { data: Record<string, unknown> },
  ][];
  return calls.length ? calls[0][0].data : undefined;
}

const EN = {
  locale: Locale.EN,
  title: 'Season 5 Update',
  excerpt: 'Three new biomes.',
  body: 'word '.repeat(400).trim(), // 400 words -> 2 minutes
};
const UK = {
  locale: Locale.UK,
  title: 'Оновлення 5 сезону',
  excerpt: 'Три нові біоми.',
  body: 'слово '.repeat(100).trim(),
};

const basePost = {
  id: 'cpost1',
  slug: 'season-5-update',
  image: 'https://img.test/a.png',
  tag: 'Update',
  tagAccent: 'primary',
  author: 'PureCraft Staff',
  published: true,
  publishedAt: new Date('2026-01-05T00:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  translations: [EN, UK],
};

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrisma },
        // The real thing over a mock: these tests should fail if an admin
        // mutation stops being recorded.
        AuditService,
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll()', () => {
    it('returns only published posts, newest first', async () => {
      mockPrisma.client.post.findMany.mockResolvedValue([basePost]);

      await service.findAll(Locale.EN);

      expect(mockPrisma.client.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { published: true },
          orderBy: { publishedAt: 'desc' },
        }),
      );
    });

    it('renders the requested locale', async () => {
      mockPrisma.client.post.findMany.mockResolvedValue([basePost]);

      const items = await service.findAll(Locale.UK);

      expect(items[0].title).toBe('Оновлення 5 сезону');
      expect(items[0].locale).toBe(Locale.UK);
    });

    it('falls back to English when the translation is missing', async () => {
      mockPrisma.client.post.findMany.mockResolvedValue([
        { ...basePost, translations: [EN] },
      ]);

      const items = await service.findAll(Locale.UK);

      // A half-translated post is a content gap, not a reason to hide it.
      expect(items[0].title).toBe('Season 5 Update');
      expect(items[0].locale).toBe(Locale.EN);
    });

    it('omits a post that has no translation at all', async () => {
      mockPrisma.client.post.findMany.mockResolvedValue([
        { ...basePost, translations: [] },
      ]);

      expect(await service.findAll(Locale.EN)).toEqual([]);
    });

    it('never sends the body to the list', async () => {
      mockPrisma.client.post.findMany.mockResolvedValue([basePost]);

      const items = await service.findAll(Locale.EN);

      expect(
        (items[0] as unknown as Record<string, unknown>).body,
      ).toBeUndefined();
    });

    it('derives read time from the rendered body', async () => {
      mockPrisma.client.post.findMany.mockResolvedValue([basePost]);

      // 400 words at 200 wpm.
      expect((await service.findAll(Locale.EN))[0].readTimeMinutes).toBe(2);
    });

    it('never reports a read time below one minute', async () => {
      mockPrisma.client.post.findMany.mockResolvedValue([
        { ...basePost, translations: [{ ...EN, body: 'Three words here.' }] },
      ]);

      expect((await service.findAll(Locale.EN))[0].readTimeMinutes).toBe(1);
    });
  });

  describe('findOne()', () => {
    it('returns the body for the rendered locale', async () => {
      mockPrisma.client.post.findFirst.mockResolvedValue(basePost);

      const post = await service.findOne('season-5-update', Locale.UK);

      expect(post.body).toBe(UK.body);
    });

    it('throws NotFoundException for an unpublished post', async () => {
      // The service filters on `published`, so an unpublished slug reads as absent.
      mockPrisma.client.post.findFirst.mockResolvedValue(null);

      await expect(service.findOne('draft', Locale.EN)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.client.post.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'draft', published: true },
        }),
      );
    });
  });

  describe('create()', () => {
    const dto = {
      slug: 'new-post',
      image: 'https://img.test/b.png',
      tag: 'News',
      tagAccent: 'sky',
      author: 'Staff',
      translations: [EN],
    };

    beforeEach(() => {
      mockPrisma.client.post.findUnique.mockResolvedValue(null);
      mockPrisma.client.post.create.mockResolvedValue({
        ...basePost,
        ...dto,
        published: false,
        publishedAt: null,
      });
    });

    it('rejects a duplicate slug with 409 rather than a raw constraint error', async () => {
      mockPrisma.client.post.findUnique.mockResolvedValue({ id: 'cother' });

      await expect(service.create('cadmin', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.client.post.create).not.toHaveBeenCalled();
    });

    it('creates the post unpublished', async () => {
      await service.create('cadmin', dto);

      const call = mockPrisma.client.post.create.mock.calls[0] as [
        { data: { published: boolean } },
      ];
      expect(call[0].data.published).toBe(false);
    });

    it('writes the translations alongside the post', async () => {
      await service.create('cadmin', dto);

      const call = mockPrisma.client.post.create.mock.calls[0] as [
        { data: { translations: { create: unknown[] } } },
      ];
      expect(call[0].data.translations.create).toHaveLength(1);
    });

    it('records the creation in the audit log', async () => {
      await service.create('cadmin', dto, '10.0.0.1');

      const row = auditRow();
      expect(row).toBeDefined();
      expect(row!.action).toBe(AdminActionType.POST_CREATE);
      expect(row!.actorId).toBe('cadmin');
      expect(row!.targetType).toBe('Post');
    });

    it('runs the post, its translations and the audit row in one transaction', async () => {
      await service.create('cadmin', dto);

      // A catalogue change that cannot be recorded must not stand.
      expect(mockPrisma.client.$transaction).toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    beforeEach(() => {
      mockPrisma.client.post.findUnique.mockResolvedValue(basePost);
      mockPrisma.client.post.update.mockResolvedValue(basePost);
    });

    it('throws NotFoundException for an unknown id', async () => {
      mockPrisma.client.post.findUnique.mockResolvedValue(null);

      await expect(
        service.update('cadmin', 'cmissing', { tag: 'News' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('upserts only the translations that were sent', async () => {
      await service.update('cadmin', 'cpost1', {
        translations: [{ ...UK, title: 'Новий заголовок' }],
      });

      // The English copy is left alone — editing one language must not wipe
      // the other.
      expect(mockPrisma.client.postTranslation.upsert).toHaveBeenCalledTimes(1);
      const call = mockPrisma.client.postTranslation.upsert.mock.calls[0] as [
        { where: { postId_locale: { locale: Locale } } },
      ];
      expect(call[0].where.postId_locale.locale).toBe(Locale.UK);
    });

    it('logs which fields actually changed, not the whole submitted form', async () => {
      await service.update('cadmin', 'cpost1', {
        tag: 'Update', // identical to the current value
        author: 'Someone Else',
      });

      expect(auditRow()!.action).toBe(AdminActionType.POST_UPDATE);
      expect((auditRow()!.metadata as { changed: string[] }).changed).toEqual([
        'author',
      ]);
    });

    it('rejects a slug already taken by another post', async () => {
      mockPrisma.client.post.findUnique
        .mockResolvedValueOnce(basePost) // the post being edited
        .mockResolvedValueOnce({ id: 'cother' }); // slug clash

      await expect(
        service.update('cadmin', 'cpost1', { slug: 'taken' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('setPublished()', () => {
    it('stamps publishedAt the first time a post is published', async () => {
      mockPrisma.client.post.findUnique.mockResolvedValue({
        ...basePost,
        published: false,
        publishedAt: null,
      });
      mockPrisma.client.post.update.mockResolvedValue(basePost);

      await service.setPublished('cadmin', 'cpost1', true);

      const call = mockPrisma.client.post.update.mock.calls[0] as [
        { data: { published: boolean; publishedAt?: Date } },
      ];
      expect(call[0].data.published).toBe(true);
      expect(call[0].data.publishedAt).toBeInstanceOf(Date);
    });

    it('keeps the original publishedAt when a post is republished', async () => {
      mockPrisma.client.post.findUnique.mockResolvedValue({
        ...basePost,
        published: false, // unpublished, but was published once before
      });
      mockPrisma.client.post.update.mockResolvedValue(basePost);

      await service.setPublished('cadmin', 'cpost1', true);

      // Re-publishing is not re-dating: the article keeps the day it ran.
      const call = mockPrisma.client.post.update.mock.calls[0] as [
        { data: { publishedAt?: Date } },
      ];
      expect(call[0].data.publishedAt).toBeUndefined();
    });

    it('records an unpublish under its own action type', async () => {
      mockPrisma.client.post.findUnique.mockResolvedValue(basePost);
      mockPrisma.client.post.update.mockResolvedValue({
        ...basePost,
        published: false,
      });

      await service.setPublished('cadmin', 'cpost1', false);

      expect(auditRow()!.action).toBe(AdminActionType.POST_UNPUBLISH);
    });

    it('records a publish as an update, since there is no PUBLISH action', async () => {
      mockPrisma.client.post.findUnique.mockResolvedValue({
        ...basePost,
        published: false,
      });
      mockPrisma.client.post.update.mockResolvedValue(basePost);

      await service.setPublished('cadmin', 'cpost1', true);

      expect(auditRow()!.action).toBe(AdminActionType.POST_UPDATE);
      expect(auditRow()!.metadata).toEqual(
        expect.objectContaining({ published: { from: false, to: true } }),
      );
    });

    it('throws NotFoundException for an unknown id', async () => {
      mockPrisma.client.post.findUnique.mockResolvedValue(null);

      await expect(
        service.setPublished('cadmin', 'cmissing', true),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllForAdmin()', () => {
    it('includes unpublished posts and every translation', async () => {
      mockPrisma.client.post.findMany.mockResolvedValue([basePost]);

      const items = await service.findAllForAdmin();

      expect(mockPrisma.client.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
      // No `where` filter at all — a draft has to be findable to be finished.
      const call = mockPrisma.client.post.findMany.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(call[0].where).toBeUndefined();
      expect(items[0].translations).toHaveLength(2);
    });
  });
});
