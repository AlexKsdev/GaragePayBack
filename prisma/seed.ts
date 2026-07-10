import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

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

  const user = await prisma.user.upsert({
    where: { email: TEST_USER.email },
    update: { name: TEST_USER.name, passwordHash, ...TEST_PROFILE },
    create: {
      email: TEST_USER.email,
      passwordHash,
      name: TEST_USER.name,
      role: Role.USER,
      ...TEST_PROFILE,
    },
    select: { id: true, email: true, name: true, role: true, rank: true, xp: true },
  });

  console.log('Seeded test user:', user);
  console.log(`Login with: ${TEST_USER.email} / ${TEST_USER.password}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
