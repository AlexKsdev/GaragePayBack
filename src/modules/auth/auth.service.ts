import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthConfig } from '../../config/auth.config';
import { frontendBaseUrl } from '../../config/frontend.config';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { MailService } from '../mail/mail.service';
import { AuthUserDto } from './dto/auth-response.dto';
import { RegisterDto } from './dto/register.dto';
import { TwoFactorSetupResponseDto } from './dto/two-factor.dto';
import {
  PENDING_2FA_PURPOSE,
  PENDING_2FA_TTL_MS,
} from '../../config/totp.config';
import { TotpService } from './totp.service';
import { AUTH_ERROR_CODES, authError } from '../../config/error-codes.config';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Internal shape only — never returned directly from a controller. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(AuthConfig) private readonly authConfig: AuthConfig,
    private readonly mail: MailService,
    private readonly totp: TotpService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });
    if (existing)
      throw new ConflictException(
        authError(AUTH_ERROR_CODES.emailInUse, 'Email already in use'),
      );

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const { user, rawRefreshToken } = await this.prisma.client.$transaction(
      async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            name: dto.name,
            role: dto.role ?? Role.USER,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            totpEnabled: true,
          },
        });
        const rt = this.newRefreshToken(created.id);
        await tx.refreshToken.create({ data: rt.data });
        return { user: created, rawRefreshToken: rt.raw };
      },
    );

    return {
      accessToken: this.signAccessToken(user.id, user.email, user.role),
      refreshToken: rawRefreshToken,
      user,
    };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;
    // Banned accounts fail exactly like bad credentials — no hint that the
    // password was right.
    if (!user.active) return null;
    return user;
  }

  /**
   * Mints the half-finished-login token: password accepted, code still owed.
   *
   * Scoped with `purpose: '2fa'` and delivered in its own cookie that the JWT
   * strategy never reads, so it cannot stand in for a session. Both guards
   * matter — the claim alone would not help if this were ever put in the
   * access cookie, and the cookie separation alone would not help if the
   * strategy were later widened.
   */
  signPending2faToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId, purpose: PENDING_2FA_PURPOSE },
      {
        secret: this.authConfig.jwtSecret,
        expiresIn: Math.floor(PENDING_2FA_TTL_MS / 1000),
      },
    );
  }

  /**
   * Completes a two-step login: verifies the pending token and the code, then
   * hands back a real session.
   */
  async verifyTwoFactorLogin(
    pendingToken: string,
    code: string,
  ): Promise<AuthTokens> {
    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwt.verify(pendingToken, {
        secret: this.authConfig.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException(
        authError(
          AUTH_ERROR_CODES.twoFactorSessionExpired,
          'Two-factor session expired',
        ),
      );
    }
    // A normal access token must never be redeemable here.
    if (payload.purpose !== PENDING_2FA_PURPOSE || !payload.sub) {
      throw new UnauthorizedException(
        authError(
          AUTH_ERROR_CODES.twoFactorSessionInvalid,
          'Invalid two-factor session',
        ),
      );
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.active)
      throw new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCredentials, 'Invalid credentials'),
      );
    if (!user.totpEnabled || !user.totpSecret) {
      throw new UnauthorizedException(
        authError(
          AUTH_ERROR_CODES.twoFactorNotEnabled,
          'Two-factor authentication is not enabled',
        ),
      );
    }
    if (!this.totp.verify(code, user.totpSecret)) {
      throw new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCode, 'Invalid code'),
      );
    }

    return this.login(user);
  }

  async login(user: User): Promise<AuthTokens> {
    const rt = this.newRefreshToken(user.id);
    await this.prisma.client.refreshToken.create({ data: rt.data });

    return {
      accessToken: this.signAccessToken(user.id, user.email, user.role),
      refreshToken: rt.raw,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        totpEnabled: user.totpEnabled,
      },
    };
  }

  /**
   * Exchanges a refresh token for a new access token, rotating the refresh
   * token in the process: the presented one is revoked and a replacement
   * issued, so each token is usable exactly once.
   *
   * That single-use property is what makes theft detectable. If a revoked
   * token is presented again, two parties hold it — the legitimate client and
   * a thief — and there is no way to tell which one is calling, so every
   * refresh token for that user is revoked and both are forced to log in again.
   */
  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const record = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (!record) throw new UnauthorizedException('Invalid refresh token');

    if (record.revokedAt) {
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (record.expiresAt < new Date()) {
      await this.prisma.client.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Banning takes effect here: the access token they hold burns out within
    // 15 minutes and this refuses to mint another.
    if (!record.user.active) {
      await this.revokeAllForUser(record.userId);
      throw new UnauthorizedException('Account is disabled');
    }

    const next = this.newRefreshToken(record.userId);
    // Atomic: never leave the old token revoked without a replacement issued,
    // nor two live tokens for one rotation.
    await this.prisma.client.$transaction([
      this.prisma.client.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      }),
      this.prisma.client.refreshToken.create({ data: next.data }),
    ]);

    return {
      accessToken: this.signAccessToken(
        record.user.id,
        record.user.email,
        record.user.role,
      ),
      refreshToken: next.raw,
    };
  }

  /**
   * Revokes the presented refresh token. Identified by the token alone — it is
   * an unguessable 48-byte random value, so it is its own credential. Not gated
   * on a live access token: those expire in 15 minutes while the refresh token
   * lives 7 days, and a user must always be able to end their session.
   * Idempotent — an unknown or already-revoked token is a no-op.
   *
   * Revoked rather than deleted: a deleted row is indistinguishable from a
   * token that never existed, so replaying a stolen token after logout would
   * look like a plain 401. Keeping the revoked row makes that replay trip the
   * reuse detector instead.
   */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Starts 2FA enrolment: mints a secret and stores it, but leaves 2FA off
   * until `enableTwoFactor` proves the user can actually produce a code —
   * otherwise a mis-scanned QR would lock them out of their own account.
   *
   * Refuses to re-run while 2FA is on: otherwise anyone holding a live session
   * could silently swap the secret for one of their own and keep the account
   * even after the owner changed their password.
   */
  async setupTwoFactor(userId: string): Promise<TwoFactorSetupResponseDto> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { email: true, totpEnabled: true },
    });
    if (!user)
      throw new NotFoundException(
        authError(AUTH_ERROR_CODES.userNotFound, 'User not found'),
      );
    if (user.totpEnabled) {
      throw new BadRequestException(
        authError(
          AUTH_ERROR_CODES.twoFactorAlreadyEnabled,
          'Two-factor authentication is already enabled. Disable it first.',
        ),
      );
    }

    const secret = this.totp.generateSecret();
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { totpSecret: secret },
    });

    return {
      otpauthUrl: this.totp.toUri(secret, user.email),
      qrDataUrl: await this.totp.toQrDataUrl(secret, user.email),
    };
  }

  /** Turns 2FA on, but only once the user proves they hold the secret. */
  async enableTwoFactor(userId: string, code: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!user)
      throw new NotFoundException(
        authError(AUTH_ERROR_CODES.userNotFound, 'User not found'),
      );
    if (user.totpEnabled) {
      throw new BadRequestException(
        authError(
          AUTH_ERROR_CODES.twoFactorAlreadyEnabled,
          'Two-factor authentication is already enabled',
        ),
      );
    }
    if (!user.totpSecret) {
      throw new BadRequestException(
        authError(
          AUTH_ERROR_CODES.twoFactorSetupMissing,
          'Start setup before enabling',
        ),
      );
    }
    if (!this.totp.verify(code, user.totpSecret)) {
      throw new BadRequestException(
        authError(AUTH_ERROR_CODES.invalidCode, 'Invalid code'),
      );
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
  }

  /**
   * Turns 2FA off. This is a security downgrade, so it re-proves both factors:
   * a hijacked session alone must not be enough to strip the second factor.
   */
  async disableTwoFactor(
    userId: string,
    password: string,
    code: string,
  ): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, totpSecret: true, totpEnabled: true },
    });
    if (!user)
      throw new NotFoundException(
        authError(AUTH_ERROR_CODES.userNotFound, 'User not found'),
      );
    if (!user.totpEnabled || !user.totpSecret) {
      throw new BadRequestException(
        authError(
          AUTH_ERROR_CODES.twoFactorNotEnabled,
          'Two-factor authentication is not enabled',
        ),
      );
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCredentials, 'Invalid credentials'),
      );
    }
    if (!this.totp.verify(code, user.totpSecret)) {
      throw new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCredentials, 'Invalid credentials'),
      );
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { totpEnabled: false, totpSecret: null },
    });
  }

  /** Kills every live session for a user (reuse detected, or password reset). */
  private async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Always resolves without error, whether or not the email exists — the
   * caller must not be able to distinguish the two (avoids account enumeration).
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) return;

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.client.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    await this.mail.sendPasswordReset(
      email,
      `${frontendBaseUrl()}/reset-password?token=${rawToken}`,
    );
  }

  /**
   * Consumes a reset token: sets the new password, invalidates every reset
   * token and every refresh token for the user (forces re-login everywhere).
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.client.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException(
        authError(
          AUTH_ERROR_CODES.resetTokenInvalid,
          'Invalid or expired reset token',
        ),
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.client.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    await this.prisma.client.passwordResetToken.deleteMany({
      where: { userId: record.userId },
    });
    await this.revokeAllForUser(record.userId);
  }

  /** Tokens are stored only as this hash, so a DB leak yields nothing usable. */
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private signAccessToken(sub: string, email: string, role: Role): string {
    const payload: JwtPayload = { sub, email, role };
    return this.jwt.sign(payload, {
      secret: this.authConfig.jwtSecret,
      expiresIn: '15m',
    });
  }

  /**
   * Mints a refresh token: a cryptographically-random opaque value (not
   * Math.random — this is a long-lived bearer credential). Returns the raw
   * token for the caller to hand to the client, and the row to store, which
   * holds only its hash.
   */
  private newRefreshToken(userId: string): {
    raw: string;
    data: { userId: string; tokenHash: string; expiresAt: Date };
  } {
    const raw = randomBytes(48).toString('hex');
    return {
      raw,
      data: {
        userId,
        tokenHash: this.hashToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    };
  }
}
