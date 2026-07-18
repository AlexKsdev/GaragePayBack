import { AdminPaymentResponseDto } from './admin-payment-response.dto';

/**
 * One page of payments plus the size of the whole match, so the admin orders
 * table can render a pager. Concrete rather than generic, mirroring
 * PaginatedUsersResponseDto — there is one consumer.
 */
export class PaginatedPaymentsResponseDto {
  items: AdminPaymentResponseDto[];
  /** Total rows matching the filter, not just this page. */
  total: number;
  page: number;
  limit: number;
}
