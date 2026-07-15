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
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthConfig } from '../../config/auth.config';
import { MailService } from '../mail/mail.service';
import { TotpService } from './totp.service';
import { Secret, TOTP } from 'otpauth';

/** Mints a genuine code the way an authenticator app would. */
function currentCode(base32: string): string {
  return new TOTP({
    issuer: 'PureCraft',
    label: 'PureCraft',
    secret: Secret.fromBase32(base32),
  }).generate();
}

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
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
};

// Set after the literal, not inside it: referencing mockPrisma within its own
// initializer makes TypeScript infer the whole object as `any`.
// Supports both forms the service uses — the interactive callback (register)
// and the array form (refresh rotation). Registered once here rather than
// per-test, since jest.clearAllMocks() clears calls but keeps implementations.
mockPrisma.client.$transaction.mockImplementation((arg: unknown) =>
  Array.isArray(arg)
    ? Promise.all(arg)
    : (arg as (tx: unknown) => unknown)(mockPrisma.client),
);

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
  active: true,
  totpEnabled: false,
  totpSecret: null as string | null,
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
        TotpService,
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

    it('issues a crypto-random refresh token but stores only its hash', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue(null);
      mockPrisma.client.user.create.mockResolvedValue({ ...baseUser });
      mockPrisma.client.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: 'a@b.com',
        password: 'password123',
        name: 'A',
      });

      // The caller gets a 48-byte random token (not Math.random).
      expect(result.refreshToken).toMatch(/^[0-9a-f]{96}$/);

      const calls = mockPrisma.client.refreshToken.create.mock.calls;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const createCall = calls[0][0] as {
        data: { tokenHash: string; token?: string };
      };
      // The row holds the sha256 of it and nothing resembling the raw value —
      // a database leak must not hand over live sessions.
      expect(createCall.data.tokenHash).toBe(
        createHash('sha256').update(result.refreshToken).digest('hex'),
      );
      expect(createCall.data.token).toBeUndefined();
      expect(JSON.stringify(createCall)).not.toContain(result.refreshToken);
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
    const liveRecord = {
      id: 'crt1',
      userId: 'ctest123',
      expiresAt: new Date(Date.now() + 100_000),
      revokedAt: null,
      user: { ...baseUser },
    };

    it('looks the token up by its hash, never by the raw value', async () => {
      mockPrisma.client.refreshToken.findUnique.mockResolvedValue({
        ...liveRecord,
      });
      await service.refresh('raw-token');

      const findCalls = mockPrisma.client.refreshToken.findUnique.mock.calls;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const where = findCalls[0][0] as { where: { tokenHash: string } };
      const expected = createHash('sha256').update('raw-token').digest('hex');
      expect(where.where.tokenHash).toBe(expected);
      expect(JSON.stringify(where)).not.toContain('raw-token');
    });

    it('throws UnauthorizedException when token not found', async () => {
      mockPrisma.client.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when token is expired', async () => {
      mockPrisma.client.refreshToken.findUnique.mockResolvedValue({
        ...liveRecord,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh('old-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rotates the token: revokes the presented one and issues a replacement', async () => {
      mockPrisma.client.refreshToken.findUnique.mockResolvedValue({
        ...liveRecord,
      });

      const result = await service.refresh('valid-token');

      expect(result.accessToken).toBeDefined();
      // A brand-new raw token comes back, not the one that was presented.
      expect(result.refreshToken).toMatch(/^[0-9a-f]{96}$/);
      expect(result.refreshToken).not.toBe('valid-token');
      // Old row revoked and replacement created in one transaction.
      expect(mockPrisma.client.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.client.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'crt1' },
        data: { revokedAt: expect.any(Date) as Date },
      });
      const createCalls = mockPrisma.client.refreshToken.create.mock.calls;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const created = createCalls[0][0] as { data: { tokenHash: string } };
      // Only the hash of the replacement is stored.
      expect(created.data.tokenHash).toBe(
        createHash('sha256').update(result.refreshToken).digest('hex'),
      );
    });

    it('detects reuse: replaying a revoked token revokes every session', async () => {
      mockPrisma.client.refreshToken.findUnique.mockResolvedValue({
        ...liveRecord,
        revokedAt: new Date(Date.now() - 5000),
      });

      await expect(service.refresh('stolen-token')).rejects.toThrow(
        UnauthorizedException,
      );
      // The whole set is burned — the legitimate client and the thief both
      // have to log in again, because we cannot tell them apart.
      expect(mockPrisma.client.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'ctest123', revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
      // No replacement is handed out to a replayer.
      expect(mockPrisma.client.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('two-step login', () => {
    const realJwt = new JwtService({});
    const SECRET = 'test-secret';

    function serviceWithRealJwt(): AuthService {
      return new AuthService(
        mockPrisma as unknown as PrismaService,
        realJwt,
        mockAuthConfig as unknown as AuthConfig,
        mockMailService as unknown as MailService,
        new TotpService(),
      );
    }

    it('rejects a normal access token presented as a pending-2FA token', async () => {
      const svc = serviceWithRealJwt();
      // Exactly what signAccessToken produces: a real, valid, signed session
      // token — it simply lacks the 2FA purpose claim.
      const accessToken = realJwt.sign(
        { sub: 'ctest123', email: 'a@b.com', role: Role.USER },
        { secret: SECRET, expiresIn: '15m' },
      );

      await expect(
        svc.verifyTwoFactorLogin(accessToken, '123456'),
      ).rejects.toThrow(UnauthorizedException);
      // Never even looked the user up — refused on the claim alone.
      expect(mockPrisma.client.user.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a token signed with the wrong secret', async () => {
      const svc = serviceWithRealJwt();
      const forged = realJwt.sign(
        { sub: 'ctest123', purpose: '2fa' },
        { secret: 'attacker-secret', expiresIn: '5m' },
      );
      await expect(svc.verifyTwoFactorLogin(forged, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('completes the login for a valid pending token + code', async () => {
      const svc = serviceWithRealJwt();
      const secret = new TotpService().generateSecret();
      const pending = svc.signPending2faToken('ctest123');

      mockPrisma.client.user.findUnique.mockResolvedValue({
        ...baseUser,
        active: true,
        totpEnabled: true,
        totpSecret: secret,
      });
      mockPrisma.client.refreshToken.create.mockResolvedValue({});

      const result = await svc.verifyTwoFactorLogin(
        pending,
        currentCode(secret),
      );
      expect(result.user.email).toBe(baseUser.email);
      expect(result.refreshToken).toMatch(/^[0-9a-f]{96}$/);
    });

    it('rejects a wrong code even with a valid pending token', async () => {
      const svc = serviceWithRealJwt();
      const secret = new TotpService().generateSecret();
      const pending = svc.signPending2faToken('ctest123');

      mockPrisma.client.user.findUnique.mockResolvedValue({
        ...baseUser,
        active: true,
        totpEnabled: true,
        totpSecret: secret,
      });

      await expect(svc.verifyTwoFactorLogin(pending, '000000')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrisma.client.refreshToken.create).not.toHaveBeenCalled();
    });

    it('refuses a banned account', async () => {
      const svc = serviceWithRealJwt();
      const secret = new TotpService().generateSecret();
      const pending = svc.signPending2faToken('ctest123');

      mockPrisma.client.user.findUnique.mockResolvedValue({
        ...baseUser,
        active: false,
        totpEnabled: true,
        totpSecret: secret,
      });

      await expect(
        svc.verifyTwoFactorLogin(pending, currentCode(secret)),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser() ban check', () => {
    it('rejects a banned account exactly like a bad password', async () => {
      mockPrisma.client.user.findUnique.mockResolvedValue({
        ...baseUser,
        active: false,
      });
      // Correct password, but the answer is the same null as a wrong one — no
      // hint that the credentials were right.
      await expect(
        service.validateUser('test@test.com', 'password123'),
      ).resolves.toBeNull();
    });
  });

  describe('two-factor enrolment', () => {
    describe('setupTwoFactor()', () => {
      it('stores a secret but leaves 2FA off until a code is proven', async () => {
        mockPrisma.client.user.findUnique.mockResolvedValue({
          email: 'a@b.com',
          totpEnabled: false,
        });
        mockPrisma.client.user.update.mockResolvedValue({});

        const result = await service.setupTwoFactor('ctest123');

        expect(result.otpauthUrl).toContain('otpauth://totp/');
        expect(result.qrDataUrl.startsWith('data:image/png;base64,')).toBe(
          true,
        );
        const updateCalls = mockPrisma.client.user.update.mock.calls;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const call = updateCalls[0][0] as {
          data: { totpSecret: string; totpEnabled?: boolean };
        };
        expect(call.data.totpSecret).toMatch(/^[A-Z2-7]+$/);
        // Crucially NOT enabled yet — a mis-scanned QR must not lock the user out.
        expect(call.data.totpEnabled).toBeUndefined();
      });

      it('refuses to re-issue a secret while 2FA is already on', async () => {
        mockPrisma.client.user.findUnique.mockResolvedValue({
          email: 'a@b.com',
          totpEnabled: true,
        });
        // Otherwise a hijacked session could swap in the attacker's own secret.
        await expect(service.setupTwoFactor('ctest123')).rejects.toThrow(
          BadRequestException,
        );
        expect(mockPrisma.client.user.update).not.toHaveBeenCalled();
      });
    });

    describe('enableTwoFactor()', () => {
      it('turns 2FA on for a valid code', async () => {
        const secret = new TotpService().generateSecret();
        mockPrisma.client.user.findUnique.mockResolvedValue({
          totpSecret: secret,
          totpEnabled: false,
        });
        mockPrisma.client.user.update.mockResolvedValue({});

        await service.enableTwoFactor('ctest123', currentCode(secret));

        expect(mockPrisma.client.user.update).toHaveBeenCalledWith({
          where: { id: 'ctest123' },
          data: { totpEnabled: true },
        });
      });

      it('rejects a wrong code and leaves 2FA off', async () => {
        const secret = new TotpService().generateSecret();
        mockPrisma.client.user.findUnique.mockResolvedValue({
          totpSecret: secret,
          totpEnabled: false,
        });
        await expect(
          service.enableTwoFactor('ctest123', '000000'),
        ).rejects.toThrow(BadRequestException);
        expect(mockPrisma.client.user.update).not.toHaveBeenCalled();
      });

      it('rejects enabling before setup has run', async () => {
        mockPrisma.client.user.findUnique.mockResolvedValue({
          totpSecret: null,
          totpEnabled: false,
        });
        await expect(
          service.enableTwoFactor('ctest123', '123456'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('disableTwoFactor()', () => {
      const secret = new TotpService().generateSecret();

      function enrolledUser() {
        return {
          passwordHash: baseUser.passwordHash,
          totpSecret: secret,
          totpEnabled: true,
        };
      }

      it('clears the secret when password and code both check out', async () => {
        mockPrisma.client.user.findUnique.mockResolvedValue(enrolledUser());
        mockPrisma.client.user.update.mockResolvedValue({});

        await service.disableTwoFactor(
          'ctest123',
          'password123',
          currentCode(secret),
        );

        expect(mockPrisma.client.user.update).toHaveBeenCalledWith({
          where: { id: 'ctest123' },
          data: { totpEnabled: false, totpSecret: null },
        });
      });

      it('refuses on a wrong password even with a valid code', async () => {
        mockPrisma.client.user.findUnique.mockResolvedValue(enrolledUser());
        await expect(
          service.disableTwoFactor('ctest123', 'wrong', currentCode(secret)),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockPrisma.client.user.update).not.toHaveBeenCalled();
      });

      it('refuses on a wrong code even with the right password — a hijacked session alone cannot strip 2FA', async () => {
        mockPrisma.client.user.findUnique.mockResolvedValue(enrolledUser());
        await expect(
          service.disableTwoFactor('ctest123', 'password123', '000000'),
        ).rejects.toThrow(UnauthorizedException);
        expect(mockPrisma.client.user.update).not.toHaveBeenCalled();
      });
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

    it('updates the password, deletes reset tokens, and revokes refresh tokens', async () => {
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
      // Refresh tokens are revoked rather than deleted, so a stolen one that
      // is replayed afterwards still trips the reuse detector.
      expect(mockPrisma.client.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: baseUser.id, revokedAt: null },
        data: { revokedAt: expect.any(Date) as Date },
      });
    });
  });
});
