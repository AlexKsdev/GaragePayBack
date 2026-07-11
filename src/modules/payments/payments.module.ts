import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { stripeProvider } from './stripe.provider';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, stripeProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
