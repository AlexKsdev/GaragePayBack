import { IsString, Length, Matches } from 'class-validator';

/** A code as shown by an authenticator app. */
export class TwoFactorCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

/** Turning 2FA off is a security downgrade, so it re-proves both factors. */
export class DisableTwoFactorDto {
  @IsString()
  @Length(1)
  password: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

export class TwoFactorSetupResponseDto {
  /** otpauth:// URI, for manual entry or a "can't scan?" fallback. */
  otpauthUrl: string;
  /** PNG data URL of the same URI. */
  qrDataUrl: string;
}
