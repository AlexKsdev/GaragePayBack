import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Locale } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WikiService } from './wiki.service';

const mockPrisma = {
  client: {
    wikiCategory: {
      findMany: jest.fn(),
    },
    wikiArticle: {
      findFirst: jest.fn(),
    },
  },
};

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
});
