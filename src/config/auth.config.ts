import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MIN_SECRET_LENGTH = 32;

@Injectable()
export class AuthConfig {
  constructor(private configService: ConfigService) {}

  get jwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters`,
      );
    }
    return secret;
  }
}
