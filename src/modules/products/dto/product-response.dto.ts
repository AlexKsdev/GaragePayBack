import { Currency } from '@prisma/client';

export class ProductResponseDto {
  id: string;
  slug: string;
  category: string;
  name: string;
  emoji: string;
  rarity: string;
  currency: Currency;
  price: number;
  badge: string | null;
  stats: string[];
}
