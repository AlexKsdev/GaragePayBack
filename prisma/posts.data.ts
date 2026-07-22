import { Locale } from '@prisma/client';

/**
 * The blog as it stood in the frontend's `features/blog/constants.ts` before
 * KAN-73. English is that file verbatim; Ukrainian is a translation of it.
 *
 * `body` seeds as the excerpt: no article text has ever existed for these posts,
 * and inventing seven articles about fictional server updates would be writing
 * content rather than migrating it. Real bodies get authored in the admin panel.
 */
export interface SeedPost {
  slug: string;
  image: string;
  tagAccent: string;
  author: string;
  publishedAt: Date;
  translations: {
    locale: Locale;
    title: string;
    excerpt: string;
    tag: string;
  }[];
}

export const POSTS: SeedPost[] = [
  {
    slug: 'season-5-update-new-biomes-dungeons',
    image:
      'https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=600&q=70',
    tagAccent: 'primary',
    author: 'PureCraft Staff',
    publishedAt: new Date('2024-12-20T12:00:00Z'),
    translations: [
      {
        locale: Locale.EN,
        title: 'Season 5 Update: New Biomes & Dungeons',
        excerpt:
          'Season 5 brings massive world changes — explore 3 new biomes, 12 new dungeons, and the long-awaited End realm expansion.',
        tag: 'Update',
      },
      {
        locale: Locale.UK,
        title: 'Оновлення 5 сезону: нові біоми та підземелля',
        excerpt:
          'П’ятий сезон приносить масштабні зміни світу — досліджуйте 3 нові біоми, 12 нових підземель і довгоочікуване розширення Енду.',
        tag: 'Оновлення',
      },
    ],
  },
  {
    slug: 'holiday-event-festive-build-contest-2024',
    image:
      'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=600&q=70',
    tagAccent: 'amber',
    author: 'Events Team',
    publishedAt: new Date('2024-12-15T12:00:00Z'),
    translations: [
      {
        locale: Locale.EN,
        title: 'Holiday Event: Festive Build Contest 2024',
        excerpt:
          'Join our annual holiday build contest! Best festive builds win exclusive cosmetics, in-game currency, and real prizes.',
        tag: 'Event',
      },
      {
        locale: Locale.UK,
        title: 'Святкова подія: конкурс різдвяних будівель 2024',
        excerpt:
          'Долучайтеся до щорічного святкового конкурсу будівель! Найкращі роботи отримають ексклюзивну косметику, ігрову валюту та справжні призи.',
        tag: 'Подія',
      },
    ],
  },
  {
    slug: 'anti-cheat-3-0-a-fairer-purecraft',
    image:
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=70',
    tagAccent: 'sky',
    author: 'Dev Team',
    publishedAt: new Date('2024-12-10T12:00:00Z'),
    translations: [
      {
        locale: Locale.EN,
        title: 'Anti-Cheat 3.0: A Fairer PureCraft',
        excerpt:
          "We've completely rewritten our anti-cheat system. Here's what changed, what we detect, and how we keep the game fair.",
        tag: 'Dev Blog',
      },
      {
        locale: Locale.UK,
        title: 'Анти-чит 3.0: чесніший PureCraft',
        excerpt:
          'Ми повністю переписали систему анти-читу. Розповідаємо, що змінилося, що саме ми виявляємо і як тримаємо гру чесною.',
        tag: 'Блог розробників',
      },
    ],
  },
  {
    slug: 'meet-the-staff-interview-with-moderatorx',
    image:
      'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&q=70',
    tagAccent: 'purple',
    author: 'Community Team',
    publishedAt: new Date('2024-12-05T12:00:00Z'),
    translations: [
      {
        locale: Locale.EN,
        title: 'Meet the Staff: Interview with ModeratorX',
        excerpt:
          'We sat down with one of our longest-serving moderators to talk about the server, community, and what makes PureCraft special.',
        tag: 'Community',
      },
      {
        locale: Locale.UK,
        title: 'Знайомство з командою: інтерв’ю з ModeratorX',
        excerpt:
          'Ми поговорили з одним із наших найдосвідченіших модераторів про сервер, спільноту і те, що робить PureCraft особливим.',
        tag: 'Спільнота',
      },
    ],
  },
  {
    slug: 'economy-rebalance-prices-trades-updated',
    image:
      'https://images.unsplash.com/photo-1520333789090-1afc82db536a?w=600&q=70',
    tagAccent: 'primary',
    author: 'PureCraft Staff',
    publishedAt: new Date('2024-11-28T12:00:00Z'),
    translations: [
      {
        locale: Locale.EN,
        title: 'Economy Rebalance: Prices & Trades Updated',
        excerpt:
          "After months of community feedback, we've rebalanced the entire server economy. Here's the full breakdown of what changed.",
        tag: 'Update',
      },
      {
        locale: Locale.UK,
        title: 'Перебалансування економіки: оновлені ціни та обміни',
        excerpt:
          'Після місяців відгуків спільноти ми перебалансували всю економіку сервера. Ось повний розбір змін.',
        tag: 'Оновлення',
      },
    ],
  },
  {
    slug: 'top-10-starter-tips-for-new-players',
    image:
      'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=600&q=70',
    tagAccent: 'yellow',
    author: 'Community Team',
    publishedAt: new Date('2024-11-20T12:00:00Z'),
    translations: [
      {
        locale: Locale.EN,
        title: 'Top 10 Starter Tips for New Players',
        excerpt:
          'Just joined PureCraft? Here are 10 essential tips to get you started — from finding a base location to your first trade.',
        tag: 'Guide',
      },
      {
        locale: Locale.UK,
        title: '10 найкращих порад для новачків',
        excerpt:
          'Щойно приєдналися до PureCraft? Ось 10 ключових порад для старту — від пошуку місця для бази до першого обміну.',
        tag: 'Гайд',
      },
    ],
  },
];
