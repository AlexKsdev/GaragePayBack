import { EventsGateway } from './events.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import type { AuthConfig } from '../../config/auth.config';

const mockJwt = {
  verify: jest.fn(),
};

const mockAuthConfig = {
  jwtSecret: 'test-secret',
} as unknown as AuthConfig;

const buildSocket = (token?: string): Partial<Socket> => ({
  handshake: { auth: token ? { token } : {} } as Socket['handshake'],
  join: jest.fn(),
  disconnect: jest.fn(),
  id: 'socket-id',
  rooms: new Set(),
  data: {},
  connected: true,
});

describe('EventsGateway', () => {
  let gateway: EventsGateway;

  beforeEach(() => {
    gateway = new EventsGateway(
      mockJwt as unknown as JwtService,
      mockAuthConfig,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleConnection()', () => {
    it('disconnects client with invalid token', () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      const client = buildSocket('bad-token');
      gateway.handleConnection(client as Socket);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects client with no token', () => {
      const client = buildSocket();
      gateway.handleConnection(client as Socket);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('allows connection with valid token', () => {
      mockJwt.verify.mockReturnValue({
        sub: 'cuser1',
        email: 'u@t.com',
        role: 'USER',
      });
      const client = buildSocket('valid-token');
      gateway.handleConnection(client as Socket);
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('WsJwtGuard', () => {
    it('throws WsException when token is missing', () => {
      const guard = new WsJwtGuard(
        mockJwt as unknown as JwtService,
        mockAuthConfig,
      );
      const ctx = {
        switchToWs: () => ({ getClient: () => buildSocket() }),
      };
      expect(() =>
        guard.canActivate(ctx as Parameters<typeof guard.canActivate>[0]),
      ).toThrow(WsException);
    });
  });
});
