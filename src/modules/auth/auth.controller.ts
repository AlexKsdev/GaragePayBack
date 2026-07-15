import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import {
  ACCESS_TTL_MS,
  authCookieOptions,
  COOKIE_NAMES,
  readableCookieOptions,
  REFRESH_TTL_MS,
} from '../../config/cookie.config';
import { AuthService } from './auth.service';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LocalGuard } from './guards/local.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @SkipCsrf()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const { accessToken, refreshToken, user } =
      await this.authService.register(dto);
    this.setAuthCookies(res, { accessToken, refreshToken }, user);
    return { user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @SkipCsrf()
  @UseGuards(LocalGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(user);
    this.setAuthCookies(
      res,
      { accessToken: result.accessToken, refreshToken: result.refreshToken },
      result.user,
    );
    return { user: result.user };
  }

  // Deliberately not gated on JwtGuard: the access token expires in 15 minutes
  // while the refresh cookie lives 7 days, so gating here would leave an idle
  // user unable to log out — and unable to clear the httpOnly cookies from JS —
  // walking away with a live session. The refresh cookie is the credential, and
  // the CSRF guard still applies.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const refreshToken = req.cookies?.[COOKIE_NAMES.refresh] as
      | string
      | undefined;
    if (refreshToken) await this.authService.logout(refreshToken);
    this.clearAuthCookies(res);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const refreshToken = req.cookies?.[COOKIE_NAMES.refresh] as
      | string
      | undefined;
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    const tokens = await this.authService.refresh(refreshToken);
    res.cookie(
      COOKIE_NAMES.access,
      tokens.accessToken,
      authCookieOptions(ACCESS_TTL_MS),
    );
    // The refresh token rotates on every use — the client must be given the
    // replacement, or its next refresh would replay a revoked token and trip
    // the reuse detector, logging it out.
    res.cookie(
      COOKIE_NAMES.refresh,
      tokens.refreshToken,
      authCookieOptions(REFRESH_TTL_MS),
    );
    return { ok: true };
  }

  // Always responds the same way whether or not the email exists, so the
  // response itself can't be used to enumerate registered accounts.
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @SkipCsrf()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If that email is registered, a reset link has been sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @SkipCsrf()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password has been reset.' };
  }

  private setAuthCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
    user: AuthUserDto,
  ): void {
    res.cookie(
      COOKIE_NAMES.access,
      tokens.accessToken,
      authCookieOptions(ACCESS_TTL_MS),
    );
    res.cookie(
      COOKIE_NAMES.refresh,
      tokens.refreshToken,
      authCookieOptions(REFRESH_TTL_MS),
    );
    res.cookie(
      COOKIE_NAMES.csrf,
      randomBytes(32).toString('hex'),
      readableCookieOptions(REFRESH_TTL_MS),
    );
    // Display-only: lets the client render the session without a round-trip.
    // Tamperable by design — never authorize on it.
    res.cookie(
      COOKIE_NAMES.user,
      JSON.stringify(user),
      readableCookieOptions(REFRESH_TTL_MS),
    );
  }

  private clearAuthCookies(res: Response): void {
    for (const name of Object.values(COOKIE_NAMES)) {
      res.clearCookie(name, { path: '/' });
    }
  }
}
