// Provider-agnostic payment types. Nothing Cashfree-specific appears here or in
// provider.ts — gateway field names, split objects, and signatures live only in
// providers/cashfree.ts. Swapping providers must not touch these types.

export type Currency = 'INR';
export type Money = { amount: number; currency: Currency };

export type PaymentStatus = 'created' | 'paid' | 'failed' | 'refunded';
export type PayoutStatus = 'released' | 'pending' | 'failed';
export type RefundStatus = 'refunded' | 'pending' | 'failed';

/** Agent onboarded as a payee/vendor. Sandbox: test settlement target, no real bank data. */
export type RegisterPayeeInput = {
  agentId: string;
  name: string;
  email?: string;
  phone?: string;
  settlement?: { vpa?: string; accountNumber?: string; ifsc?: string };
};
export type PayeeRef = { providerPayeeId: string };

/** Donor pays the full `amount`; the agent's `agentSharePct` is held (deferred), not settled. */
export type EscrowOrderInput = {
  bookingId: string;
  amount: Money;
  agentSharePct: number; // 0..100 — platform keeps (100 - agentSharePct)
  donor: { id: string; email?: string; phone?: string };
  payee: PayeeRef; // the agent, already registered as a vendor
};

export type PaymentOrder = {
  orderId: string;
  paymentSessionId: string; // opaque token the client uses to pay (sandbox)
  status: PaymentStatus;
};

/** Settles the agent's deferred share. Calling this is the ONLY way funds reach the agent. */
export type PayoutInput = {
  bookingId: string;
  orderId: string;
  payee: PayeeRef;
  amount: Money; // the agent's held share
};
export type PayoutResult = { transferId: string; status: PayoutStatus };

/** Reserved for a separate explicit refund case — NOT the failed-delivery path. */
export type RefundInput = { orderId: string; amount: Money; reason?: string };
export type RefundResult = { refundId: string; status: RefundStatus };

// ── Deposit (the edibility gate) ─────────────────────────────────────────────
// Separate money from the ride escrow above. The UPI-vs-card mechanism is chosen
// inside the adapter; these types never mention it.

export type DepositStatus = 'none' | 'held' | 'released' | 'captured';

export type DepositHoldInput = {
  bookingId: string;
  deposit: Money; // full refundable deposit collected at booking
  donor: { id: string; email?: string; phone?: string };
  // No agent yet at booking — agentMinimum/payee are supplied at capture time.
};

export type DepositHold = {
  depositId: string; // opaque id for this deposit (== its order id)
  orderId: string;
  paymentSessionId: string; // opaque token the donor uses to pay (sandbox)
  status: DepositStatus;
};

/** PASS path — return the whole deposit to the donor (refund, or void a card hold). */
export type DepositReleaseInput = {
  depositId: string;
  orderId: string;
  amount: Money; // the full deposit
};

export type DepositResult = { status: DepositStatus; reference: string };

/** FAIL path — pay the agent the minimum, return any remainder to the donor. */
export type DepositCaptureInput = {
  depositId: string;
  orderId: string;
  agentMinimum: Money; // paid to the agent on the spot
  donorRemainder: Money; // deposit - agentMinimum, back to the donor (may be 0)
  payee: PayeeRef;
};

export type DepositCaptureResult = {
  status: DepositStatus; // 'captured'
  agentPayout: PayoutResult;
  donorRefund: RefundResult; // remainder → donor; a no-op result when remainder is 0
};

export type WebhookEventType =
  | 'payment.captured'
  | 'payment.failed'
  | 'payout.settled'
  | 'refund.processed'
  | 'unknown';

export type WebhookEvent = {
  type: WebhookEventType;
  orderId?: string;
  bookingId?: string;
  raw: Record<string, unknown>;
};

/** Append-only money audit log entry types (the `payment_events` collection). */
export type PaymentEventType =
  | 'order_created'
  | 'escrow_held'
  | 'payout_released'
  | 'refunded'
  | 'webhook';
