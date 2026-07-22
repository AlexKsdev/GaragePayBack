import { Module } from '@nestjs/common';
import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';

// No AuthModule: every route here is public, and nothing in this module writes.
@Module({
  controllers: [WikiController],
  providers: [WikiService],
})
export class WikiModule {}
