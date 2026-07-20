import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QuestsController } from './quests.controller';
import { QuestsService } from './quests.service';

// AuthModule for StepUpGuard's JwtService/AuthConfig — it verifies the step-up
// token this module's catalogue writes require.
@Module({
  imports: [AuthModule],
  controllers: [QuestsController],
  providers: [QuestsService],
})
export class QuestsModule {}
