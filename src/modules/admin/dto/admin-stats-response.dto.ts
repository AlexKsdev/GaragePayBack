export interface RecentPayment {
  id: string;
  amount: number;
  status: string;
  createdAt: Date;
  userId: string;
}

/** Read-only dashboard figures. Nothing here is a secret, but nothing here is
 * a whole row either — each source is selected field by field. */
export class AdminStatsResponseDto {
  totalUsers: number;
  totalAdmins: number;
  totalProducts: number;
  revenueCents: number;
  recentPayments: RecentPayment[];
}
