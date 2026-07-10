import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('PrismaService');
  private prismaClient: PrismaClient;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    // Prisma 7's default "client" engine requires a driver adapter.
    const adapter = new PrismaPg({ connectionString });
    this.prismaClient = new PrismaClient({
      adapter,
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    try {
      await this.prismaClient.$connect();
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.prismaClient.$disconnect();
      this.logger.log('✅ Database disconnected');
    } catch (error) {
      this.logger.error('❌ Failed to disconnect from database:', error);
    }
  }

  // Get the Prisma client instance for use in services
  get client(): PrismaClient {
    return this.prismaClient;
  }
}
