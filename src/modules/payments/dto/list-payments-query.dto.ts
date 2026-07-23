import { IsEnum, IsOptional } from 'class-validator';
import { PaymentStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListPaymentsQueryDto extends PaginationDto {
  /** Narrow the admin orders list to a single lifecycle state. */
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}
