// Data model for `payment_events` — the append-only money audit log.
// Every escrow hold / release / refund and every gateway webhook lands here so
// money state can be reconstructed independently of the booking doc.
// Written ONLY by Cloud Functions; immutable once written.

export type PaymentEventType =
  | 'order_created'
  | 'escrow_held'
  | 'payout_released'
  | 'refunded'
  | 'webhook';

export type PaymentEvent = {
  id: string;
  bookingId: string;
  type: PaymentEventType;
  amount?: number;
  /** Raw gateway payload for audit. */
  raw?: Record<string, unknown>;
  at: number; // server timestamp
};
