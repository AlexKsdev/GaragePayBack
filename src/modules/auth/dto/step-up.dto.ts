import { IsString, Length } from 'class-validator';

/**
 * Re-prove a factor to unlock destructive actions. With authenticator codes
 * gone, the password is the factor being re-entered.
 */
export class StepUpDto {
  @IsString()
  @Length(1)
  password: string;
}
