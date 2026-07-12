import { Currency } from '@prisma/client';

/** Result of buying a product with in-game currency, incl. the user's new balances. */
export class PurchaseResponseDto {
  id: string;
  currency: Currency;
  price: number;
  createdAt: Date;
  product: {
    id: string;
    slug: string;
    name: string;
    emoji: string;
  };
  /** Balances after the purchase, so the client can refresh without a second call. */
  coins: number;
  gems: number;
}
