import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { resendProvider } from './resend.provider';

@Module({
  providers: [MailService, resendProvider],
  exports: [MailService],
})
export class MailModule {}
