import { Role } from '@prisma/client';

export class AuthUserDto {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/** Tokens are delivered as httpOnly cookies, never in the body. */
export class AuthResponseDto {
  user: AuthUserDto;
}
