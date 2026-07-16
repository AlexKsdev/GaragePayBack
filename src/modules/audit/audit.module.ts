import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Global so any module that mutates someone else's data can record it without
 * every feature module re-importing this one.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
