export class CheckoutResponseDto {
  /** Stripe-hosted checkout page to redirect the user to. */
  url: string;
  /** Our pending Payment id, so the client can poll status after redirect. */
  paymentId: string;
}
