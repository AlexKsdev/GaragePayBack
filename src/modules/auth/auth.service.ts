import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
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
    if (existing) throw new ConflictException('Email already in use');

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
          select: { id: true, email: true, name: true, role: true },
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
    return valid ? user : null;
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
      throw new BadRequestException('Invalid or expired reset token');
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
