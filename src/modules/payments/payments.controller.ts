import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { AuthenticatedRequest } from '../../common/types/authenticated-request.type';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query() pagination: PaginationDto,
  ): Promise<PaymentResponseDto[]> {
    return this.paymentsService.findAll(user.id, user.role, pagination);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.findOne(user.id, id, user.role);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  updateStatus(
    @Param('id', ParseCuidPipe) id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.updateStatus(id, dto);
  }
}
