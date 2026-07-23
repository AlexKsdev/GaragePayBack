import { Role } from '@prisma/client';

export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  role: Role;
  twoFactorEnabled: boolean;
  rank: string;
  avatar: string | null;
  level: number;
  xp: number;
  xpNext: number;
  coins: number;
  gems: number;
  playtimeMinutes: number;
  kills: number;
  deaths: number;
  blocksPlaced: number;
  streak: number;
  createdAt: Date;
}
