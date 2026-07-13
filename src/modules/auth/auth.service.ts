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
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { MailService } from '../mail/mail.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(AuthConfig) private readonly authConfig: AuthConfig,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const { user, refreshTokenRecord } = await this.prisma.client.$transaction(
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
        const rt = await tx.refreshToken.create({
          data: {
            userId: created.id,
            token: this.generateRefreshToken(),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          },
        });
        return { user: created, refreshTokenRecord: rt };
      },
    );

    return {
      accessToken: this.signAccessToken(user.id, user.email, user.role),
      refreshToken: refreshTokenRecord.token,
      user,
    };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async login(user: User): Promise<AuthResponseDto> {
    const rt = await this.prisma.client.refreshToken.create({
      data: {
        userId: user.id,
        token: this.generateRefreshToken(),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken: this.signAccessToken(user.id, user.email, user.role),
      refreshToken: rt.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<{ accessToken: string }> {
    const record = await this.prisma.client.refreshToken.findUnique({
      where: { token: dto.refreshToken },
      include: { user: true },
    });

    if (!record) throw new UnauthorizedException('Invalid refresh token');
    if (record.expiresAt < new Date()) {
      await this.prisma.client.refreshToken.delete({
        where: { token: dto.refreshToken },
      });
      throw new UnauthorizedException('Refresh token expired');
    }

    return {
      accessToken: this.signAccessToken(
        record.user.id,
        record.user.email,
        record.user.role,
      ),
    };
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.client.refreshToken.deleteMany({
      where: { userId, token: refreshToken },
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
        tokenHash: this.hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const frontendUrl =
      process.env.FRONTEND_URL?.split(',')[0] ?? 'http://localhost:3001';
    await this.mail.sendPasswordReset(
      email,
      `${frontendUrl}/reset-password?token=${rawToken}`,
    );
  }

  /**
   * Consumes a reset token: sets the new password, invalidates every reset
   * token and every refresh token for the user (forces re-login everywhere).
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.client.passwordResetToken.findUnique({
      where: { tokenHash: this.hashResetToken(token) },
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
    await this.prisma.client.refreshToken.deleteMany({
      where: { userId: record.userId },
    });
  }

  private hashResetToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private signAccessToken(sub: string, email: string, role: Role): string {
    const payload: JwtPayload = { sub, email, role };
    return this.jwt.sign(payload, {
      secret: this.authConfig.jwtSecret,
      expiresIn: '15m',
    });
  }

  private generateRefreshToken(): string {
    return (
      Math.random().toString(36).slice(2) +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2)
    );
  }
}
