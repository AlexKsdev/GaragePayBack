import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminActionType, Locale } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WikiService } from './wiki.service';

const mockPrisma = {
  client: {
    wikiCategory: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    wikiCategoryTranslation: {
      upsert: jest.fn(),
    },
    wikiArticle: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    wikiArticleTranslation: {
      upsert: jest.fn(),
    },
    adminAction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
};

// Hands the callback the client itself, so `tx.wikiArticle.update` is the same
// mock the assertions below already watch.
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

const EN_CAT = { locale: Locale.EN, title: 'Getting Started' };
const UK_CAT = { locale: Locale.UK, title: 'Перші кроки' };

const EN_ART = {
  locale: Locale.EN,
  title: 'Server Rules',
  summary: 'Read before playing.',
  body: 'No griefing.',
};
const UK_ART = {
  locale: Locale.UK,
  title: 'Правила сервера',
  summary: 'Прочитай перед грою.',
  body: 'Жодного грифу.',
};

function category(overrides: Record<string, unknown> = {}) {
  return {
    key: 'getting-started',
    icon: 'Home',
    accent: 'primary',
    translations: [EN_CAT, UK_CAT],
    articles: [
      {
        slug: 'server-rules',
        published: true,
        translations: [EN_ART, UK_ART],
      },
    ],
    ...overrides,
  };
}

describe('WikiService', () => {
  let service: WikiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WikiService,
        { provide: PrismaService, useValue: mockPrisma },
        // The real thing over a mock: these tests should fail if an admin
        // mutation stops being recorded.
        AuditService,
      ],
    }).compile();

    service = module.get<WikiService>(WikiService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll()', () => {
    it('orders categories and their articles by sortOrder', async () => {
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([category()]);

      await service.findAll(Locale.EN);

      expect(mockPrisma.client.wikiCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { sortOrder: 'asc' } }),
      );
    });

    it('renders the requested locale', async () => {
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([category()]);

      const [cat] = await service.findAll(Locale.UK);

      expect(cat.title).toBe('Перші кроки');
      expect(cat.articles[0].title).toBe('Правила сервера');
      expect(cat.locale).toBe(Locale.UK);
    });

    it('falls back to English per row, not per request', async () => {
      // The category is translated but the article is not: the reader should
      // get the Ukrainian heading over an English article, not lose both.
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([
        category({
          articles: [
            { slug: 'server-rules', published: true, translations: [EN_ART] },
          ],
        }),
      ]);

      const [cat] = await service.findAll(Locale.UK);

      expect(cat.title).toBe('Перші кроки');
      expect(cat.articles[0].title).toBe('Server Rules');
      expect(cat.articles[0].locale).toBe(Locale.EN);
    });

    it('never sends article bodies to the listing', async () => {
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([category()]);

      const [cat] = await service.findAll(Locale.EN);

      expect(
        (cat.articles[0] as unknown as Record<string, unknown>).body,
      ).toBeUndefined();
    });

    it('asks only for published articles', async () => {
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([category()]);

      await service.findAll(Locale.EN);

      const call = mockPrisma.client.wikiCategory.findMany.mock.calls[0] as [
        { include: { articles: { where: Record<string, unknown> } } },
      ];
      expect(call[0].include.articles.where).toEqual(
        expect.objectContaining({ published: true }),
      );
    });

    it('drops a category left with no articles', async () => {
      // Either everything in it is unpublished, or the search matched nothing —
      // an empty card is noise on the page.
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([
        category({ articles: [] }),
      ]);

      expect(await service.findAll(Locale.EN)).toEqual([]);
    });

    it('omits an article with no translation at all', async () => {
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([
        category({
          articles: [
            { slug: 'server-rules', published: true, translations: [] },
          ],
        }),
      ]);

      expect(await service.findAll(Locale.EN)).toEqual([]);
    });

    describe('search', () => {
      it('matches title, summary and body, case-insensitively', async () => {
        mockPrisma.client.wikiCategory.findMany.mockResolvedValue([category()]);

        await service.findAll(Locale.EN, 'rules');

        const call = mockPrisma.client.wikiCategory.findMany.mock.calls[0] as [
          {
            include: {
              articles: { where: { translations: { some: unknown } } };
            };
          },
        ];
        expect(call[0].include.articles.where.translations).toEqual({
          some: {
            OR: [
              { title: { contains: 'rules', mode: 'insensitive' } },
              { summary: { contains: 'rules', mode: 'insensitive' } },
              { body: { contains: 'rules', mode: 'insensitive' } },
            ],
          },
        });
      });

      it('treats a blank search as no search', async () => {
        mockPrisma.client.wikiCategory.findMany.mockResolvedValue([category()]);

        await service.findAll(Locale.EN, '   ');

        const call = mockPrisma.client.wikiCategory.findMany.mock.calls[0] as [
          { include: { articles: { where: Record<string, unknown> } } },
        ];
        expect(call[0].include.articles.where).toEqual({ published: true });
      });

      it('searches every language, not just the one being rendered', async () => {
        // A reader on /uk typing an English term still finds the article —
        // the match is on any translation, the render falls back separately.
        mockPrisma.client.wikiCategory.findMany.mockResolvedValue([category()]);

        await service.findAll(Locale.UK, 'rules');

        const call = mockPrisma.client.wikiCategory.findMany.mock.calls[0] as [
          {
            include: {
              articles: {
                where: { translations: { some: Record<string, unknown> } };
              };
            };
          },
        ];
        expect(
          call[0].include.articles.where.translations.some.locale,
        ).toBeUndefined();
      });
    });
  });

  describe('findOne()', () => {
    const article = {
      slug: 'server-rules',
      published: true,
      translations: [EN_ART, UK_ART],
      category: { key: 'getting-started', translations: [EN_CAT, UK_CAT] },
    };

    it('returns the body for the rendered locale', async () => {
      mockPrisma.client.wikiArticle.findFirst.mockResolvedValue(article);

      const result = await service.findOne('server-rules', Locale.UK);

      expect(result.body).toBe('Жодного грифу.');
      expect(result.categoryTitle).toBe('Перші кроки');
      expect(result.categoryKey).toBe('getting-started');
    });

    it('throws NotFoundException for an unpublished article', async () => {
      mockPrisma.client.wikiArticle.findFirst.mockResolvedValue(null);

      await expect(service.findOne('draft', Locale.EN)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.client.wikiArticle.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { slug: 'draft', published: true },
        }),
      );
    });

    it('throws NotFoundException when the article has no translation', async () => {
      mockPrisma.client.wikiArticle.findFirst.mockResolvedValue({
        ...article,
        translations: [],
      });

      await expect(service.findOne('server-rules', Locale.EN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllForAdmin()', () => {
    it('includes unpublished articles and every translation', async () => {
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([category()]);

      await service.findAllForAdmin();

      const call = mockPrisma.client.wikiCategory.findMany.mock.calls[0] as [
        { include: { articles: Record<string, unknown> } },
      ];
      // A draft has to be findable to be finished, so unlike the public read
      // there is no `where` on the articles at all.
      expect(call[0].include.articles.where).toBeUndefined();
    });

    it('keeps an empty category, unlike the public listing', async () => {
      // The public read drops it as noise; an admin needs it to add the first
      // article to it.
      mockPrisma.client.wikiCategory.findMany.mockResolvedValue([
        category({ articles: [] }),
      ]);

      expect(await service.findAllForAdmin()).toHaveLength(1);
    });
  });

  describe('createCategory()', () => {
    const dto = {
      key: 'redstone',
      icon: 'Zap',
      accent: 'yellow',
      translations: [{ locale: Locale.EN, title: 'Redstone' }],
    };

    beforeEach(() => {
      mockPrisma.client.wikiCategory.findUnique.mockResolvedValue(null);
      mockPrisma.client.wikiCategory.create.mockResolvedValue({
        id: 'ccat1',
        ...dto,
      });
    });

    it('rejects a duplicate key with 409 rather than a raw constraint error', async () => {
      mockPrisma.client.wikiCategory.findUnique.mockResolvedValue({
        id: 'cother',
      });

      await expect(service.createCategory('cadmin', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.client.wikiCategory.create).not.toHaveBeenCalled();
    });

    it('records the creation in the audit log', async () => {
      await service.createCategory('cadmin', dto, '10.0.0.1');

      expect(auditRow()?.action).toBe(AdminActionType.WIKI_CATEGORY_CREATE);
      expect(auditRow()?.targetType).toBe('WikiCategory');
    });

    it('writes the row and its translations in one transaction', async () => {
      await service.createCategory('cadmin', dto);

      expect(mockPrisma.client.$transaction).toHaveBeenCalled();
    });
  });

  describe('createArticle()', () => {
    const dto = {
      slug: 'redstone-basics',
      categoryId: 'ccat1',
      translations: [
        {
          locale: Locale.EN,
          title: 'Redstone Basics',
          summary: 'Start here.',
          body: 'Wires.',
        },
      ],
    };

    beforeEach(() => {
      mockPrisma.client.wikiArticle.findUnique.mockResolvedValue(null);
      mockPrisma.client.wikiCategory.findUnique.mockResolvedValue({
        id: 'ccat1',
      });
      mockPrisma.client.wikiArticle.create.mockResolvedValue({
        id: 'cart1',
        ...dto,
        published: false,
      });
    });

    it('refuses an article whose category does not exist', async () => {
      // The FK would reject it anyway; a 404 says which half was wrong.
      mockPrisma.client.wikiCategory.findUnique.mockResolvedValue(null);

      await expect(service.createArticle('cadmin', dto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.client.wikiArticle.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate slug', async () => {
      mockPrisma.client.wikiArticle.findUnique.mockResolvedValue({
        id: 'cother',
      });

      await expect(service.createArticle('cadmin', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates the article unpublished', async () => {
      await service.createArticle('cadmin', dto);

      const call = mockPrisma.client.wikiArticle.create.mock.calls[0] as [
        { data: { published: boolean } },
      ];
      expect(call[0].data.published).toBe(false);
    });
  });

  describe('updateArticle()', () => {
    const current = {
      id: 'cart1',
      slug: 'server-rules',
      categoryId: 'ccat1',
      published: true,
      sortOrder: 0,
      translations: [EN_ART, UK_ART],
    };

    beforeEach(() => {
      mockPrisma.client.wikiArticle.findUnique.mockResolvedValue(current);
      mockPrisma.client.wikiArticle.update.mockResolvedValue(current);
      mockPrisma.client.wikiCategory.findUnique.mockResolvedValue({
        id: 'ccat2',
      });
    });

    it('upserts only the translations that were sent', async () => {
      await service.updateArticle('cadmin', 'cart1', {
        translations: [{ ...UK_ART, title: 'Новий заголовок' }],
      });

      // Editing one language must not wipe the other.
      expect(
        mockPrisma.client.wikiArticleTranslation.upsert,
      ).toHaveBeenCalledTimes(1);
      const call = mockPrisma.client.wikiArticleTranslation.upsert.mock
        .calls[0] as [{ where: { articleId_locale: { locale: Locale } } }];
      expect(call[0].where.articleId_locale.locale).toBe(Locale.UK);
    });

    it('logs which fields actually changed, not the whole submitted form', async () => {
      await service.updateArticle('cadmin', 'cart1', {
        slug: 'server-rules', // identical to the current value
        sortOrder: 3,
      });

      expect(auditRow()?.action).toBe(AdminActionType.WIKI_ARTICLE_UPDATE);
      expect((auditRow()?.metadata as { changed: string[] }).changed).toEqual([
        'sortOrder',
      ]);
    });

    it('refuses a move into a category that does not exist', async () => {
      mockPrisma.client.wikiCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.updateArticle('cadmin', 'cart1', { categoryId: 'cmissing' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setArticlePublished()', () => {
    beforeEach(() => {
      mockPrisma.client.wikiArticle.findUnique.mockResolvedValue({
        id: 'cart1',
        slug: 'server-rules',
        published: false,
      });
      mockPrisma.client.wikiArticle.update.mockResolvedValue({
        id: 'cart1',
        published: true,
      });
    });

    it('records an unpublish under its own action type', async () => {
      await service.setArticlePublished('cadmin', 'cart1', false);

      expect(auditRow()?.action).toBe(AdminActionType.WIKI_ARTICLE_UNPUBLISH);
    });

    it('records a publish as an update, since there is no PUBLISH action', async () => {
      await service.setArticlePublished('cadmin', 'cart1', true);

      expect(auditRow()?.action).toBe(AdminActionType.WIKI_ARTICLE_UPDATE);
      expect(auditRow()?.metadata).toEqual(
        expect.objectContaining({ published: { from: false, to: true } }),
      );
    });

    it('throws NotFoundException for an unknown id', async () => {
      mockPrisma.client.wikiArticle.findUnique.mockResolvedValue(null);

      await expect(
        service.setArticlePublished('cadmin', 'cmissing', true),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
