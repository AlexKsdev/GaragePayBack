import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const TEST_USER = {
  email: 'test@purecraft.net',
  password: 'test1234',
  name: 'Test Player',
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
    update: { name: TEST_USER.name, passwordHash },
    create: {
      email: TEST_USER.email,
      passwordHash,
      name: TEST_USER.name,
      role: Role.USER,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log('Seeded test user:', user);
  console.log(`Login with: ${TEST_USER.email} / ${TEST_USER.password}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
