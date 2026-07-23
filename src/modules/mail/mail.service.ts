import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Resend } from 'resend';
import { AUTH_ERROR_CODES, authError } from '../../config/error-codes.config';
import { RESEND_CLIENT } from './resend.provider';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(RESEND_CLIENT) private readonly resend: Resend) {}

  /**
   * A failed send is an outage, not a bug, so it leaves here as a 503 carrying
   * a code the client can localize — rather than the plain Error it used to
   * throw, which escaped to the filter as "Internal server error" and told the
   * user nothing about why their sign-in stopped (KAN-79).
   *
   * The provider's own reason is logged, never returned: it can name the
   * recipient and the sending domain.
   */
  private deliveryFailed(context: string, reason: string): never {
    this.logger.error(`${context}: ${reason}`);
    throw new ServiceUnavailableException(
      authError(
        AUTH_ERROR_CODES.emailDeliveryFailed,
        "We couldn't send the email. Please try again in a moment.",
      ),
    );
  }

  async sendPasswordReset(email: string, resetLink: string): Promise<void> {
    await this.send(
      'Password reset email',
      email,
      'Reset your PureCraft password',
      `Click the link below to reset your password. This link expires in 30 minutes.\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
    );
    this.logger.log(`Password reset email sent to ${email}`);
  }

  async sendTwoFactorCode(email: string, code: string): Promise<void> {
    await this.send(
      'Two-factor code email',
      email,
      'Your PureCraft sign-in code',
      `Your sign-in code is ${code}. It expires in 5 minutes.\n\nIf you didn't try to sign in, you can ignore this email.`,
    );
    // Never log the code itself.
    this.logger.log(`Two-factor code email sent to ${email}`);
  }

  /**
   * The single exit to the provider, so no failure can leave this class as
   * anything but a 503. Resend reports a refusal in the resolved value and a
   * transport failure by throwing; both mean nothing was delivered.
   */
  private async send(
    context: string,
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    const from = process.env.RESEND_FROM_EMAIL ?? 'no-reply@purecraft.net';

    let error: { message: string } | null;
    try {
      ({ error } = await this.resend.emails.send({ from, to, subject, text }));
    } catch (cause) {
      this.deliveryFailed(
        context,
        cause instanceof Error ? cause.message : String(cause),
      );
    }

    if (error) this.deliveryFailed(context, error.message);
  }
}
