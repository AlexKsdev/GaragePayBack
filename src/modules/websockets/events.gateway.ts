import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { AuthConfig } from '../../config/auth.config';
import { JwtPayload } from '../../common/types/jwt-payload.type';

@WebSocketGateway({
  namespace: '/events',
  cors: { origin: process.env['CORS_ORIGIN'] ?? '*' },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly authConfig: AuthConfig,
  ) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.authConfig.jwtSecret,
      });
      (client as Socket & { user: unknown }).user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      void client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected: ${client.id}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('payment:subscribe')
  handlePaymentSubscribe(client: Socket, data: { paymentId: string }): void {
    void client.join(`payment:${data.paymentId}`);
  }

  emitPaymentUpdate(paymentId: string, payload: unknown): void {
    this.server.to(`payment:${paymentId}`).emit('payment:updated', payload);
  }
}
