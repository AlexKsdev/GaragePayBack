import { IsString, Length, Matches } from 'class-validator';

/** A 6-digit code as delivered by email. */
export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

/** Turning 2FA off is a security downgrade, so it re-proves both factors:
 * the password and a fresh emailed code. */
export class DisableTwoFactorDto {
  @IsString()
  @Length(1)
  password: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

/** Returned by /auth/login when the password was right but a code is owed. */
export class TwoFactorRequiredDto {
  twoFactorRequired: true;
}
