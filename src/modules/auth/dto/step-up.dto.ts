import { IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * Re-prove one factor. Either field alone is enough — a TOTP code for accounts
 * that have 2FA on (every admin does), the password otherwise. The service
 * decides which it will accept; the DTO only shapes the input.
 */
export class StepUpDto {
  @IsOptional()
  @IsString()
  @Length(1)
  password?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code?: string;
}
