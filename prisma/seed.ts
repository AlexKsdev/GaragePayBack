import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { POSTS } from './posts.data';
import { PRODUCTS, RARITY_RANK } from './products.data';
import { WIKI } from './wiki.data';

const TEST_USER = {
  email: 'test@purecraft.net',
  password: 'test1234',
  name: 'Steve_PureCraft',
};

// Player profile / game stats surfaced on the account dashboard.
// `xp` is total lifetime XP; 25800 → level 47 (500/1020 into the level).
const TEST_PROFILE = {
  rank: 'Elite',
  avatar: 'https://mc-heads.net/avatar/Steve/128',
  xp: 25800,
  coins: 4820,
  gems: 38,
  playtimeMinutes: 8520, // 142h
  kills: 382,
  deaths: 94,
  blocksPlaced: 1_200_000,
  streak: 7,
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash(TEST_USER.password, 10);

  // `role` and `twoFactorEnabled` are reset on update, not just on create: the
  // browser-verification workflow promotes this account to ADMIN and switches
  // 2FA on, and a seed that leaves it there is not returning the database to a
  // known state. A 2FA-enabled seed user also cannot log in at all, since the
  // sandbox mail sender only delivers to the real admin's address.
  const ACCESS_DEFAULTS = { role: Role.USER, twoFactorEnabled: false };

  const user = await prisma.user.upsert({
    where: { email: TEST_USER.email },
    update: {
      name: TEST_USER.name,
      passwordHash,
      ...ACCESS_DEFAULTS,
      ...TEST_PROFILE,
    },
    create: {
      email: TEST_USER.email,
      passwordHash,
      name: TEST_USER.name,
      ...ACCESS_DEFAULTS,
      ...TEST_PROFILE,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      rank: true,
      xp: true,
    },
  });

  console.log('Seeded test user:', user);
  console.log(`Login with: ${TEST_USER.email} / ${TEST_USER.password}`);

  for (const product of PRODUCTS) {
    const data = { ...product, rarityRank: RARITY_RANK[product.rarity] ?? 0 };
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: data,
      create: data,
    });
  }
  console.log(`Seeded ${PRODUCTS.length} shop products`);

  // Re-running the seed resets these six posts to their seeded text, including
  // anything edited in the admin panel. Posts created there have other slugs
  // and are left alone.
  for (const { translations, ...post } of POSTS) {
    const { id } = await prisma.post.upsert({
      where: { slug: post.slug },
      update: { ...post, published: true },
      create: { ...post, published: true },
      select: { id: true },
    });

    for (const { locale, ...text } of translations) {
      // Body seeds as the excerpt — see posts.data.ts for why.
      const row = { ...text, body: text.excerpt };
      await prisma.postTranslation.upsert({
        where: { postId_locale: { postId: id, locale } },
        create: { postId: id, locale, ...row },
        update: row,
      });
    }
  }
  console.log(`Seeded ${POSTS.length} blog posts (EN + UK)`);

  // Same contract as the posts above: re-running resets these rows to their
  // seeded text. Categories and articles authored later have other keys and
  // slugs and are left alone.
  let articleCount = 0;
  for (const [
    index,
    { translations, articles, ...category },
  ] of WIKI.entries()) {
    const { id } = await prisma.wikiCategory.upsert({
      where: { key: category.key },
      update: { ...category, sortOrder: index },
      create: { ...category, sortOrder: index },
      select: { id: true },
    });

    for (const { locale, ...text } of translations) {
      await prisma.wikiCategoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: id, locale } },
        create: { categoryId: id, locale, ...text },
        update: text,
      });
    }

    for (const [order, article] of articles.entries()) {
      const { id: articleId } = await prisma.wikiArticle.upsert({
        where: { slug: article.slug },
        update: { categoryId: id, sortOrder: order, published: true },
        create: {
          slug: article.slug,
          categoryId: id,
          sortOrder: order,
          published: true,
        },
        select: { id: true },
      });

      for (const { locale, ...text } of article.translations) {
        // Body seeds as the summary — see wiki.data.ts for why.
        const row = { ...text, body: text.summary };
        await prisma.wikiArticleTranslation.upsert({
          where: { articleId_locale: { articleId, locale } },
          create: { articleId, locale, ...row },
          update: row,
        });
      }
      articleCount += 1;
    }
  }
  console.log(
    `Seeded ${WIKI.length} wiki categories and ${articleCount} articles (EN + UK)`,
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
