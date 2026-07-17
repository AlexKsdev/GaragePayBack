import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

// AuthModule for StepUpGuard's JwtService/AuthConfig — it verifies the step-up
// token this module's catalogue writes require.
@Module({
  imports: [AuthModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
