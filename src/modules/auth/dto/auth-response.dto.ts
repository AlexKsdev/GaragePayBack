import { Role } from '@prisma/client';

export class AuthUserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Whether 2FA is on — lets the client render the real state, not a guess. */
  totpEnabled: boolean;
}

/** Tokens are delivered as httpOnly cookies, never in the body. */
export class AuthResponseDto {
  user: AuthUserDto;
}
