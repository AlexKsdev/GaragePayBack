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
import { createHash, randomBytes, randomInt } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthConfig } from '../../config/auth.config';
import { frontendBaseUrl } from '../../config/frontend.config';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { MailService } from '../mail/mail.service';
import { AuthUserDto } from './dto/auth-response.dto';
import { RegisterDto } from './dto/register.dto';
import {
  PENDING_2FA_PURPOSE,
  PENDING_2FA_TTL_MS,
  TWO_FA_ACTION_TTL_MS,
  TWO_FA_DISABLE_PURPOSE,
  TWO_FA_ENABLE_PURPOSE,
} from '../../config/two-factor.config';
import { AUTH_ERROR_CODES, authError } from '../../config/error-codes.config';
import { STEP_UP_PURPOSE, STEP_UP_TTL_MS } from '../../config/step-up.config';

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
            twoFactorEnabled: true,
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
   * Re-proves the password and mints the short-lived token that unlocks
   * destructive actions. With authenticator codes gone, the password is the
   * factor re-entered here.
   */
  async stepUp(userId: string, password: string): Promise<string> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    // Same answer for a missing, banned or unproven account — no signal either.
    if (
      !user ||
      !user.active ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCredentials, 'Invalid credentials'),
      );
    }

    return this.jwt.sign(
      { sub: user.id, purpose: STEP_UP_PURPOSE },
      {
        secret: this.authConfig.jwtSecret,
        expiresIn: Math.floor(STEP_UP_TTL_MS / 1000),
      },
    );
  }

  /**
   * Opens the second-factor step after the password checks out: mints a
   * one-time code, emails it, and binds its hash to the pending token.
   *
   * The hash rides inside the signed, httpOnly token, so the second factor
   * needs no DB column and expires with the token itself. The client can't
   * forge or read-modify it, and it is never the plaintext code. Scoped with
   * `purpose: '2fa'` so a session token can never be redeemed at /2fa/verify.
   */
  async startTwoFactorLogin(user: User): Promise<string> {
    const code = this.generateEmailCode();
    const codeHash = await bcrypt.hash(code, 10);
    await this.mail.sendTwoFactorCode(user.email, code);
    return this.signCodeToken(
      user.id,
      PENDING_2FA_PURPOSE,
      codeHash,
      PENDING_2FA_TTL_MS,
    );
  }

  /** Re-issues an email code against a still-valid pending session. */
  async resendTwoFactorCode(pendingToken: string): Promise<string> {
    const { sub } = this.readCodeToken(pendingToken, PENDING_2FA_PURPOSE);
    const user = await this.prisma.client.user.findUnique({
      where: { id: sub },
    });
    if (!user || !user.active || !user.twoFactorEnabled) {
      throw new UnauthorizedException(
        authError(
          AUTH_ERROR_CODES.twoFactorSessionInvalid,
          'Invalid two-factor session',
        ),
      );
    }
    return this.startTwoFactorLogin(user);
  }

  /** A cryptographically-random 6-digit code, zero-padded. */
  private generateEmailCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /**
   * Completes a two-step login: verifies the pending token and the emailed
   * code, then hands back a real session.
   */
  async verifyTwoFactorLogin(
    pendingToken: string,
    code: string,
  ): Promise<AuthTokens> {
    const { sub, codeHash } = this.readCodeToken(
      pendingToken,
      PENDING_2FA_PURPOSE,
    );

    const user = await this.prisma.client.user.findUnique({
      where: { id: sub },
    });
    if (!user || !user.active)
      throw new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCredentials, 'Invalid credentials'),
      );

    if (!(await bcrypt.compare(code, codeHash))) {
      throw new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCode, 'Invalid code'),
      );
    }

    return this.login(user);
  }

  /** Signs a short-lived token binding an emailed code's hash to a purpose. */
  private signCodeToken(
    sub: string,
    purpose: string,
    codeHash: string,
    ttlMs: number,
  ): string {
    return this.jwt.sign(
      { sub, purpose, codeHash },
      {
        secret: this.authConfig.jwtSecret,
        expiresIn: Math.floor(ttlMs / 1000),
      },
    );
  }

  /**
   * Verifies a code token's signature and purpose, returning the subject and
   * bound code hash. The purpose claim keeps a login token, an enable token and
   * a disable token from ever being swapped for one another, and a plain access
   * token from being redeemed as any of them.
   */
  private readCodeToken(
    token: string,
    expectedPurpose: string,
  ): { sub: string; codeHash: string } {
    let payload: { sub?: string; purpose?: string; codeHash?: string };
    try {
      payload = this.jwt.verify(token, { secret: this.authConfig.jwtSecret });
    } catch {
      throw new UnauthorizedException(
        authError(
          AUTH_ERROR_CODES.twoFactorSessionExpired,
          'Two-factor session expired',
        ),
      );
    }
    if (
      payload.purpose !== expectedPurpose ||
      !payload.sub ||
      !payload.codeHash
    ) {
      throw new UnauthorizedException(
        authError(
          AUTH_ERROR_CODES.twoFactorSessionInvalid,
          'Invalid two-factor session',
        ),
      );
    }
    return { sub: payload.sub, codeHash: payload.codeHash };
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
        twoFactorEnabled: user.twoFactorEnabled,
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
   * Starts 2FA enrolment by emailing a confirmation code and returning a token
   * that binds its hash. Nothing is turned on until `enableTwoFactor` proves the
   * code arrived — which also confirms the address actually receives mail, so a
   * wrong or undeliverable inbox can't lock the owner out at the next login.
   *
   * Refuses while 2FA is already on: re-enrolling would be meaningless and the
   * disable flow is the way back.
   */
  async setupTwoFactor(userId: string): Promise<string> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user)
      throw new NotFoundException(
        authError(AUTH_ERROR_CODES.userNotFound, 'User not found'),
      );
    if (user.twoFactorEnabled) {
      throw new BadRequestException(
        authError(
          AUTH_ERROR_CODES.twoFactorAlreadyEnabled,
          'Two-factor authentication is already enabled. Disable it first.',
        ),
      );
    }

    return this.emailActionCode(userId, user.email, TWO_FA_ENABLE_PURPOSE);
  }

  /** Turns 2FA on once the emailed confirmation code checks out. */
  async enableTwoFactor(
    userId: string,
    code: string,
    actionToken: string | undefined,
  ): Promise<void> {
    await this.consumeActionCode(
      actionToken,
      TWO_FA_ENABLE_PURPOSE,
      userId,
      code,
    );
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });
  }

  /** Emails the code needed to turn 2FA off, returning the token that binds it. */
  async requestDisableCode(userId: string): Promise<string> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user)
      throw new NotFoundException(
        authError(AUTH_ERROR_CODES.userNotFound, 'User not found'),
      );
    if (!user.twoFactorEnabled) {
      throw new BadRequestException(
        authError(
          AUTH_ERROR_CODES.twoFactorNotEnabled,
          'Two-factor authentication is not enabled',
        ),
      );
    }
    return this.emailActionCode(userId, user.email, TWO_FA_DISABLE_PURPOSE);
  }

  /**
   * Turns 2FA off. A security downgrade, so it re-proves both factors: the
   * password and a fresh emailed code — a hijacked session alone must not be
   * enough to strip the second factor.
   */
  async disableTwoFactor(
    userId: string,
    password: string,
    code: string,
    actionToken: string | undefined,
  ): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, twoFactorEnabled: true },
    });
    if (!user)
      throw new NotFoundException(
        authError(AUTH_ERROR_CODES.userNotFound, 'User not found'),
      );
    if (!user.twoFactorEnabled) {
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
    await this.consumeActionCode(
      actionToken,
      TWO_FA_DISABLE_PURPOSE,
      userId,
      code,
    );

    await this.prisma.client.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false },
    });
  }

  /** Generates a code, emails it, and returns the token binding its hash. */
  private async emailActionCode(
    userId: string,
    email: string,
    purpose: string,
  ): Promise<string> {
    const code = this.generateEmailCode();
    const codeHash = await bcrypt.hash(code, 10);
    await this.mail.sendTwoFactorCode(email, code);
    return this.signCodeToken(userId, purpose, codeHash, TWO_FA_ACTION_TTL_MS);
  }

  /** Validates an action token against the caller and the entered code. */
  private async consumeActionCode(
    actionToken: string | undefined,
    purpose: string,
    userId: string,
    code: string,
  ): Promise<void> {
    if (!actionToken) {
      throw new BadRequestException(
        authError(
          AUTH_ERROR_CODES.twoFactorSessionExpired,
          'No two-factor session',
        ),
      );
    }
    const { sub, codeHash } = this.readCodeToken(actionToken, purpose);
    // The token is bound to the account that requested it: a code emailed to
    // one user can't be redeemed while signed in as another.
    if (sub !== userId || !(await bcrypt.compare(code, codeHash))) {
      throw new BadRequestException(
        authError(AUTH_ERROR_CODES.invalidCode, 'Invalid code'),
      );
    }
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
