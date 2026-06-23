import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthConfig } from '../../../config/auth.config';
import { JwtPayload } from '../../../common/types/jwt-payload.type';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly authConfig: AuthConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) throw new WsException('Missing authentication token');

    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.authConfig.jwtSecret,
      });
      (client as Socket & { user: unknown }).user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      return true;
    } catch {
      throw new WsException('Invalid or expired token');
    }
  }
}
