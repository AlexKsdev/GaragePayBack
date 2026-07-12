import { PaymentStatus } from '@prisma/client';

export class PaymentResponseDto {
  id: string;
  userId: string;
  amount: number;
  gems: number;
  description: string | null;
  status: PaymentStatus;
  stripePaymentId: string | null;
  createdAt: Date;
}
