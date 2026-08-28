import type {
  DepositCaptureInput,
  DepositCaptureResult,
  DepositHold,
  DepositHoldInput,
  DepositReleaseInput,
  DepositResult,
  DepositStatus,
  EscrowOrderInput,
  PaymentOrder,
  PaymentStatus,
  PayeeRef,
  PayoutInput,
  PayoutResult,
  RefundInput,
  RefundResult,
  RegisterPayeeInput,
  WebhookEvent,
} from './types';

/**
 * The single seam every payment/payout call goes through. The core loop depends
 * on THIS interface, never on a concrete provider. Swapping Cashfree for another
 * gateway = add one file under providers/ + change the factory. No loop edits.
 *
 * Money semantics enforced by the loop on top of this interface:
 *
 *  - Edibility rejected BEFORE payment → no escrow order was ever created, so no
 *    funds move. Nothing to release, nothing to refund.
 *
 *  - Delivery FAILS after the donor paid → the platform RETAINS the full amount.
 *    `releasePayout` is simply never called, so the agent's held share never
 *    settles and stays with the platform. This is NOT a refund — do not call
 *    `refund` here.
 *
 *  - Delivery COMPLETES (proof uploaded) → `releasePayout` settles the agent's
 *    deferred share; the platform keeps its percentage.
 *
 *  - `refund` exists only for a separate, explicit refund decision — never as the
 *    failed-delivery path.
 */
export interface PaymentProvider {
  readonly name: string;

  /** Onboard an agent as a payee/vendor so their share can later be settled. */
  registerPayee(input: RegisterPayeeInput): Promise<PayeeRef>;

  // ── Deposit (edibility gate) — separate money from the ride escrow ──────────
  // The UPI-vs-card mechanism (refund vs card VOID/CAPTURE) is chosen inside the
  // adapter from the payment method actually used; the loop never sees it.

  /** Collect the refundable deposit at booking (before the agent arrives). */
  holdDeposit(input: DepositHoldInput): Promise<DepositHold>;

  /** PASS → return the whole deposit to the donor instantly. */
  releaseDeposit(input: DepositReleaseInput): Promise<DepositResult>;

  /** FAIL → pay the agent the minimum on the spot, return any remainder to the donor. */
  captureDepositForFailedTrip(input: DepositCaptureInput): Promise<DepositCaptureResult>;

  /** Read-through deposit status for reconciliation. */
  getDepositStatus(depositId: string): Promise<DepositStatus>;

  /** Create the escrow order: donor pays full amount, agent's share held (deferred). */
  createEscrowOrder(input: EscrowOrderInput): Promise<PaymentOrder>;

  /** Read-through payment status for reconciliation. */
  getPaymentStatus(orderId: string): Promise<PaymentStatus>;

  /** Settle the agent's held share. The ONLY path by which the agent gets paid. */
  releasePayout(input: PayoutInput): Promise<PayoutResult>;

  /** Explicit refund case only. Never the failed-delivery retention path. */
  refund(input: RefundInput): Promise<RefundResult>;

  /** Verify a gateway callback's signature and normalize it to a WebhookEvent. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookEvent;
}
