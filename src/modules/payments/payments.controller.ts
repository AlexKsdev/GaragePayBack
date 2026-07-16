import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { StepUpGuard } from '../../common/guards/step-up.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { GemPack } from '../../config/gem-packs.config';
import { CheckoutResponseDto } from './dto/checkout-response.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Public: static catalog of real-money gem packs (no user data).
  @Get('gem-packs')
  getGemPacks(): GemPack[] {
    return this.paymentsService.getGemPacks();
  }

  // Public: Stripe posts here server-to-server; authenticity is verified by the
  // webhook signature, not a JWT. Needs the raw request body for that check.
  @Post('webhook')
  @HttpCode(200)
  @SkipCsrf()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true }> {
    if (!req.rawBody) throw new BadRequestException('Missing request body');
    await this.paymentsService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }

  @Post('checkout')
  @UseGuards(JwtGuard)
  createCheckout(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.paymentsService.createCheckout(user.id, dto.packId);
  }

  @Post()
  @UseGuards(JwtGuard)
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtGuard)
  findAll(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query() pagination: PaginationDto,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.findAll(user.id, pagination);
  }

  @Get(':id')
  @UseGuards(JwtGuard)
  findOne(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.findOne(user.id, id);
  }

  // Moves money, so it needs a freshly re-proved factor on top of admin rights.
  @Patch(':id/status')
  @UseGuards(JwtGuard, AdminGuard, StepUpGuard)
  updateStatus(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdatePaymentStatusDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Ip() ip: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.updateStatus(id, dto, user.id, ip);
  }
}
