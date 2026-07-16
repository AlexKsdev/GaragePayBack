import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { stripeProvider } from './stripe.provider';

// AuthModule for StepUpGuard's JwtService/AuthConfig — it verifies the step-up
// token the status endpoint requires.
@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, stripeProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
