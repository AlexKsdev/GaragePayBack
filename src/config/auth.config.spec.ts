import { ConfigService } from '@nestjs/config';
import { AuthConfig } from './auth.config';

function makeConfig(secret?: string): AuthConfig {
  const configService = {
    get: (_key: string) => secret,
  } as unknown as ConfigService;
  return new AuthConfig(configService);
}

describe('AuthConfig.jwtSecret', () => {
  it('throws when JWT_SECRET is unset', () => {
    expect(() => makeConfig(undefined).jwtSecret).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is shorter than 32 chars', () => {
    expect(() => makeConfig('too-short').jwtSecret).toThrow(/JWT_SECRET/);
  });

  it('returns the secret when it is strong', () => {
    const strong = 'x'.repeat(32);
    expect(makeConfig(strong).jwtSecret).toBe(strong);
  });
});
