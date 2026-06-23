import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthConfig } from '../../config/auth.config';
import { EventsGateway } from './events.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [EventsGateway, WsJwtGuard, AuthConfig],
  exports: [EventsGateway],
})
export class WebSocketsModule {}
