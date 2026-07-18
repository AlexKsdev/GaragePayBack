import { PaymentStatus } from '@prisma/client';

/** The buyer, trimmed to what an orders table needs to identify a row. */
export class PaymentBuyerDto {
  id: string;
  name: string;
  email: string;
}

/**
 * A payment as seen by an admin: the same fields as the owner sees, plus the
 * buyer's identity so the orders list is legible without a second lookup.
 */
export class AdminPaymentResponseDto {
  id: string;
  userId: string;
  amount: number;
  gems: number;
  description: string | null;
  status: PaymentStatus;
  stripePaymentId: string | null;
  createdAt: Date;
  user: PaymentBuyerDto;
}
