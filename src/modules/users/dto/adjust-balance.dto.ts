import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

/**
 * A delta, not a new total: two admins acting at once should both have their
 * adjustment applied rather than one silently overwriting the other. Negative
 * values deduct.
 */
export class AdjustBalanceDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  coins?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gems?: number;
}
