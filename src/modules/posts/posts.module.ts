import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

// AuthModule for StepUpGuard's JwtService/AuthConfig — it verifies the step-up
// token this module's writes require.
@Module({
  imports: [AuthModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
