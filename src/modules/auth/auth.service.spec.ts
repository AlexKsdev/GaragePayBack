import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { AuthConfig } from '../../config/auth.config';
import { MailService } from '../mail/mail.service';

const mockPrisma = {
  client: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn(),
};

const mockAuthConfig = {
  jwtSecret: 'test-secret',
  jwtExpiresIn: '15m',
};

const mockMailService = {
  sendPasswordReset: jest.fn(),
};

const baseUser = {
  id: 'ctest123',
  email: 'test@test.com',
  name: 'Test User',
  role: Role.USER,
  passwordHash: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    mockJwt.sign.mockReturnValue('signed-token');

    const hash = await bcrypt.hash('password123', 10);
    baseUser.passwordHash = hash;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: AuthConfig, useValue: mockAuthConfig },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register()', () => {
    it('hashes the password before storing', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      mockPrisma.client.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma.client) => Promise<unknown>) =>
          fn(mockPrisma.client),
      );
      mockPrisma.client.user.create.mockResolvedValue({ ...baseUser });
      mockPrisma.client.refreshToken.create.mockResolvedValue({ token: 'rt' });

      const dto = { email: 'a@b.com', password: 'password123', name: 'A' };
      await service.register(dto);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createCall = mockPrisma.client.user.create.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      expect(createCall.data.passwordHash).toBeDefined();
      expect(createCall.data.passwordHash).not.toBe('password123');
      const isHashed = await bcrypt.compare(
        'password123',
        createCall.data.passwordHash,
      );
      expect(isHashed).toBe(true);
    });

    it('generates a crypto-random refresh token (96 hex chars, not Math.random)', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      mockPrisma.client.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma.client) => Promise<unknown>) =>
          fn(mockPrisma.client),
      );
      mockPrisma.client.user.create.mockResolvedValue({ ...baseUser });
      mockPrisma.client.refreshToken.create.mockResolvedValue({ token: 'rt' });

      await service.register({
        email: 'a@b.com',
        password: 'password123',
        name: 'A',
      });

      const calls = mockPrisma.client.refreshToken.create.mock.calls;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createCall = calls[0][0] as { data: { token: string } };
      expect(createCall.data.token).toMatch(/^[0-9a-f]{96}$/);
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(baseUser);
      await expect(
        service.register({
          email: 'test@test.com',
          password: 'password123',
          name: 'A',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('returns response without passwordHash', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      mockPrisma.client.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma.client) => Promise<unknown>) =>
          fn(mockPrisma.client),
      );
      mockPrisma.client.user.create.mockResolvedValue({
        id: baseUser.id,
        email: baseUser.email,
        name: baseUser.name,
        role: baseUser.role,
      });
      mockPrisma.client.refreshToken.create.mockResolvedValue({
        token: 'refresh-token',
      });

      const result = await service.register({
        email: 'a@b.com',
        password: 'password123',
        name: 'A',
      });
      expect(
        (result.user as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
    });
  });

  describe('validateUser()', () => {
    it('returns null for unknown email', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      const result = await service.validateUser(
        'unknown@test.com',
        'password123',
      );
      expect(result).toBeNull();
    });

    it('returns null for wrong password', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      const result = await service.validateUser(
        'test@test.com',
        'wrongpassword',
      );
      expect(result).toBeNull();
    });

    it('returns user for correct credentials', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      const result = await service.validateUser('test@test.com', 'password123');
      expect(result).not.toBeNull();
      expect(result?.email).toBe('test@test.com');
    });
  });

  describe('refresh()', () => {
    it('throws UnauthorizedException when token not found', async () => {
      mockPrisma.client.refreshToken.findUnique.mockResolvedValue(null);
      await expect(
        service.refresh({ refreshToken: 'bad-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is expired', async () => {
      mockPrisma.client.refreshToken.findUnique.mockResolvedValue({
        token: 'old-token',
        userId: 'ctest123',
        expiresAt: new Date(Date.now() - 1000),
        user: { ...baseUser },
      });
      await expect(
        service.refresh({ refreshToken: 'old-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns a new accessToken for valid token', async () => {
      mockPrisma.client.refreshToken.findUnique.mockResolvedValue({
        token: 'valid-token',
        userId: 'ctest123',
        expiresAt: new Date(Date.now() + 100_000),
        user: { ...baseUser },
      });
      const result = await service.refresh({ refreshToken: 'valid-token' });
      expect(result.accessToken).toBeDefined();
    });
  });

  describe('forgotPassword()', () => {
    it('creates a reset token and emails a link when the user exists', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({ ...baseUser });
      mockPrisma.client.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword('test@test.com');

      expect(mockPrisma.client.passwordResetToken.create).toHaveBeenCalled();
      expect(mockMailService.sendPasswordReset).toHaveBeenCalledWith(
        'test@test.com',
        expect.stringContaining('/reset-password?token='),
      );
    });

    it('does nothing (no error, no email) for an unknown email', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword('unknown@test.com'),
      ).resolves.toBeUndefined();
      expect(
        mockPrisma.client.passwordResetToken.create,
      ).not.toHaveBeenCalled();
      expect(mockMailService.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword()', () => {
    it('throws BadRequestException for an unknown token', async () => {
      mockPrisma.client.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword('bad-token', 'newpassword123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for an expired token', async () => {
      mockPrisma.client.passwordResetToken.findUnique.mockResolvedValue({
        id: 'crt1',
        userId: baseUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.resetPassword('expired-token', 'newpassword123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates the password, deletes reset tokens, and invalidates refresh tokens', async () => {
      mockPrisma.client.passwordResetToken.findUnique.mockResolvedValue({
        id: 'crt1',
        userId: baseUser.id,
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 100_000),
      });
      mockPrisma.client.user.update.mockResolvedValue({ ...baseUser });

      await service.resetPassword('valid-token', 'newpassword123');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const updateCall = mockPrisma.client.user.update.mock.calls[0][0] as {
        where: { id: string };
        data: { passwordHash: string };
      };
      expect(updateCall.where.id).toBe(baseUser.id);
      const isHashed = await bcrypt.compare(
        'newpassword123',
        updateCall.data.passwordHash,
      );
      expect(isHashed).toBe(true);

      expect(
        mockPrisma.client.passwordResetToken.deleteMany,
      ).toHaveBeenCalledWith({ where: { userId: baseUser.id } });
      expect(mockPrisma.client.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id },
      });
    });
  });
});
