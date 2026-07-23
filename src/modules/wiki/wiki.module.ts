import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';

// AuthModule for StepUpGuard's JwtService/AuthConfig — it verifies the step-up
// token this module's admin writes require. Reading stays public.
@Module({
  imports: [AuthModule],
  controllers: [WikiController],
  providers: [WikiService],
})
export class WikiModule {}
