import { Locale } from '@prisma/client';

/**
 * The wiki as it stood in the frontend's `features/wiki/constants.ts` before
 * KAN-80. English is that file verbatim; Ukrainian is a translation of it.
 *
 * Article `body` seeds as the summary: the mock never had article text — its
 * articles were list items that led nowhere — and inventing thirty guides about
 * a server's real rules, plugins and commands would be fabricating facts, not
 * migrating content. Real text gets authored later.
 */
export interface SeedWikiArticle {
  slug: string;
  translations: {
    locale: Locale;
    title: string;
    summary: string;
  }[];
}

export interface SeedWikiCategory {
  key: string;
  icon: string;
  accent: string;
  translations: { locale: Locale; title: string }[];
  articles: SeedWikiArticle[];
}

export const WIKI: SeedWikiCategory[] = [
  {
    key: 'getting-started',
    icon: 'Home',
    accent: 'primary',
    translations: [
      { locale: Locale.EN, title: 'Getting Started' },
      { locale: Locale.UK, title: 'Перші кроки' },
    ],
    articles: [
      {
        slug: 'how-to-join-purecraft',
        translations: [
          {
            locale: Locale.EN,
            title: 'How to Join PureCraft',
            summary: 'Step-by-step guide for first-time players.',
          },
          {
            locale: Locale.UK,
            title: 'Як приєднатися до PureCraft',
            summary: 'Покроковий гайд для новачків.',
          },
        ],
      },
      {
        slug: 'server-rules',
        translations: [
          {
            locale: Locale.EN,
            title: 'Server Rules',
            summary: "Read before playing — know what's allowed.",
          },
          {
            locale: Locale.UK,
            title: 'Правила сервера',
            summary: 'Прочитай перед грою — знай, що дозволено.',
          },
        ],
      },
      {
        slug: 'starter-guide',
        translations: [
          {
            locale: Locale.EN,
            title: 'Starter Guide',
            summary: 'First 30 minutes on the server.',
          },
          {
            locale: Locale.UK,
            title: 'Гайд для початківців',
            summary: 'Перші 30 хвилин на сервері.',
          },
        ],
      },
      {
        slug: 'commands-reference',
        translations: [
          {
            locale: Locale.EN,
            title: 'Commands Reference',
            summary: 'All player commands listed.',
          },
          {
            locale: Locale.UK,
            title: 'Довідник команд',
            summary: 'Перелік усіх команд гравця.',
          },
        ],
      },
    ],
  },
  {
    key: 'survival',
    icon: 'Pickaxe',
    accent: 'amber',
    translations: [
      { locale: Locale.EN, title: 'Survival' },
      { locale: Locale.UK, title: 'Виживання' },
    ],
    articles: [
      {
        slug: 'world-borders-and-zones',
        translations: [
          {
            locale: Locale.EN,
            title: 'World Borders & Zones',
            summary: 'Where you can build and explore.',
          },
          {
            locale: Locale.UK,
            title: 'Межі світу та зони',
            summary: 'Де можна будувати й досліджувати.',
          },
        ],
      },
      {
        slug: 'economy-guide',
        translations: [
          {
            locale: Locale.EN,
            title: 'Economy Guide',
            summary: 'Trading, shops, and earning money.',
          },
          {
            locale: Locale.UK,
            title: 'Гайд з економіки',
            summary: 'Торгівля, магазини та заробіток.',
          },
        ],
      },
      {
        slug: 'farming-and-resources',
        translations: [
          {
            locale: Locale.EN,
            title: 'Farming & Resources',
            summary: 'Best spots and farming strategies.',
          },
          {
            locale: Locale.UK,
            title: 'Ферми та ресурси',
            summary: 'Найкращі місця та стратегії фарму.',
          },
        ],
      },
      {
        slug: 'custom-crafting',
        translations: [
          {
            locale: Locale.EN,
            title: 'Custom Crafting',
            summary: 'Unique recipes exclusive to PureCraft.',
          },
          {
            locale: Locale.UK,
            title: 'Власні рецепти',
            summary: 'Унікальні рецепти лише на PureCraft.',
          },
        ],
      },
    ],
  },
  {
    key: 'pvp',
    icon: 'Swords',
    accent: 'red',
    translations: [
      { locale: Locale.EN, title: 'PvP' },
      { locale: Locale.UK, title: 'PvP' },
    ],
    articles: [
      {
        slug: 'pvp-zones',
        translations: [
          {
            locale: Locale.EN,
            title: 'PvP Zones',
            summary: 'Where PvP is enabled and rules.',
          },
          {
            locale: Locale.UK,
            title: 'PvP-зони',
            summary: 'Де ввімкнено PvP і за якими правилами.',
          },
        ],
      },
      {
        slug: 'arena-guide',
        translations: [
          {
            locale: Locale.EN,
            title: 'Arena Guide',
            summary: 'How to join and win arena fights.',
          },
          {
            locale: Locale.UK,
            title: 'Гайд по арені',
            summary: 'Як долучитися до боїв на арені й перемагати.',
          },
        ],
      },
      {
        slug: 'clan-wars',
        translations: [
          {
            locale: Locale.EN,
            title: 'Clan Wars',
            summary: 'Organize and battle other clans.',
          },
          {
            locale: Locale.UK,
            title: 'Війни кланів',
            summary: 'Організовуй бої та воюй з іншими кланами.',
          },
        ],
      },
      {
        slug: 'ranked-system',
        translations: [
          {
            locale: Locale.EN,
            title: 'Ranked System',
            summary: 'How the PvP ranking works.',
          },
          {
            locale: Locale.UK,
            title: 'Рейтингова система',
            summary: 'Як працює PvP-рейтинг.',
          },
        ],
      },
    ],
  },
  {
    key: 'ranks',
    icon: 'Shield',
    accent: 'sky',
    translations: [
      { locale: Locale.EN, title: 'Ranks & Perks' },
      { locale: Locale.UK, title: 'Ранги та привілеї' },
    ],
    articles: [
      {
        slug: 'rank-comparison',
        translations: [
          {
            locale: Locale.EN,
            title: 'Rank Comparison',
            summary: 'VIP vs Elite vs Legend — full comparison.',
          },
          {
            locale: Locale.UK,
            title: 'Порівняння рангів',
            summary: 'VIP проти Elite проти Legend — повне порівняння.',
          },
        ],
      },
      {
        slug: 'how-to-upgrade',
        translations: [
          {
            locale: Locale.EN,
            title: 'How to Upgrade',
            summary: 'Purchasing and applying rank upgrades.',
          },
          {
            locale: Locale.UK,
            title: 'Як підвищити ранг',
            summary: 'Купівля та застосування підвищень рангу.',
          },
        ],
      },
      {
        slug: 'rank-commands',
        translations: [
          {
            locale: Locale.EN,
            title: 'Rank Commands',
            summary: 'All commands unlocked per rank.',
          },
          {
            locale: Locale.UK,
            title: 'Команди рангів',
            summary: 'Усі команди, що відкриваються з кожним рангом.',
          },
        ],
      },
      {
        slug: 'free-vs-premium',
        translations: [
          {
            locale: Locale.EN,
            title: 'Free vs Premium',
            summary: 'What free players get vs premium.',
          },
          {
            locale: Locale.UK,
            title: 'Безкоштовно проти преміум',
            summary: 'Що отримують звичайні гравці, а що — преміум.',
          },
        ],
      },
    ],
  },
  {
    key: 'community',
    icon: 'Users',
    accent: 'purple',
    translations: [
      { locale: Locale.EN, title: 'Community' },
      { locale: Locale.UK, title: 'Спільнота' },
    ],
    articles: [
      {
        slug: 'clans-and-teams',
        translations: [
          {
            locale: Locale.EN,
            title: 'Clans & Teams',
            summary: 'Creating, joining, and managing clans.',
          },
          {
            locale: Locale.UK,
            title: 'Клани та команди',
            summary: 'Створення, вступ і керування кланами.',
          },
        ],
      },
      {
        slug: 'events-calendar',
        translations: [
          {
            locale: Locale.EN,
            title: 'Events Calendar',
            summary: 'All upcoming and recurring events.',
          },
          {
            locale: Locale.UK,
            title: 'Календар подій',
            summary: 'Усі майбутні та регулярні події.',
          },
        ],
      },
      {
        slug: 'staff-team',
        translations: [
          {
            locale: Locale.EN,
            title: 'Staff Team',
            summary: 'Meet the moderators and admins.',
          },
          {
            locale: Locale.UK,
            title: 'Команда сервера',
            summary: 'Знайомство з модераторами та адміністраторами.',
          },
        ],
      },
      {
        slug: 'appeals-and-reports',
        translations: [
          {
            locale: Locale.EN,
            title: 'Appeals & Reports',
            summary: 'Ban appeals, bug reports, player reports.',
          },
          {
            locale: Locale.UK,
            title: 'Апеляції та скарги',
            summary: 'Оскарження банів, звіти про баги, скарги на гравців.',
          },
        ],
      },
    ],
  },
  {
    key: 'technical',
    icon: 'Zap',
    accent: 'yellow',
    translations: [
      { locale: Locale.EN, title: 'Technical' },
      { locale: Locale.UK, title: 'Технічне' },
    ],
    articles: [
      {
        slug: 'lag-and-performance',
        translations: [
          {
            locale: Locale.EN,
            title: 'Lag & Performance',
            summary: 'Optimize your game for best experience.',
          },
          {
            locale: Locale.UK,
            title: 'Лаги та продуктивність',
            summary: 'Оптимізуй гру для найкращого досвіду.',
          },
        ],
      },
      {
        slug: 'supported-clients',
        translations: [
          {
            locale: Locale.EN,
            title: 'Supported Clients',
            summary: 'Allowed mods and clients.',
          },
          {
            locale: Locale.UK,
            title: 'Підтримувані клієнти',
            summary: 'Дозволені моди та клієнти.',
          },
        ],
      },
      {
        slug: 'plugins-list',
        translations: [
          {
            locale: Locale.EN,
            title: 'Plugins List',
            summary: 'Server plugins and what they do.',
          },
          {
            locale: Locale.UK,
            title: 'Список плагінів',
            summary: 'Плагіни сервера та що вони роблять.',
          },
        ],
      },
      {
        slug: 'data-and-privacy',
        translations: [
          {
            locale: Locale.EN,
            title: 'Data & Privacy',
            summary: 'What data we store and why.',
          },
          {
            locale: Locale.UK,
            title: 'Дані та приватність',
            summary: 'Які дані ми зберігаємо і навіщо.',
          },
        ],
      },
    ],
  },
];
