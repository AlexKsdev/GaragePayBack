import { Inject, Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { RESEND_CLIENT } from './resend.provider';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(RESEND_CLIENT) private readonly resend: Resend) {}

  async sendPasswordReset(email: string, resetLink: string): Promise<void> {
    const from = process.env.RESEND_FROM_EMAIL ?? 'no-reply@purecraft.net';

    const { error } = await this.resend.emails.send({
      from,
      to: email,
      subject: 'Reset your PureCraft password',
      text: `Click the link below to reset your password. This link expires in 30 minutes.\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
    });
    if (error) {
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }

    this.logger.log(`Password reset email sent to ${email}`);
  }
}
