import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('PrismaService');
  private prismaClient = new PrismaClient({
    log: ['error', 'warn'],
  });

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
