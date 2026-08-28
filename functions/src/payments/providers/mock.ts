import type { PaymentProvider } from '../provider';
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
} from '../types';

type MockOrder = {
  orderId: string;
  bookingId: string;
  amount: number;
  agentSharePct: number;
  status: PaymentStatus;
  payoutStatus: 'none' | 'released';
};

/**
 * Deterministic in-memory provider for the emulator and unit tests. No network.
 * Mirrors the retention semantics: an order that never has releasePayout called
 * keeps its `payoutStatus: 'none'` — the agent's share stays with the platform.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  private orders = new Map<string, MockOrder>();
  private deposits = new Map<string, DepositStatus>();
  private seq = 0;

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  async registerPayee(input: RegisterPayeeInput): Promise<PayeeRef> {
    return { providerPayeeId: `vendor_${input.agentId}` };
  }

  async createEscrowOrder(input: EscrowOrderInput): Promise<PaymentOrder> {
    const orderId = `order_${input.bookingId}`;
    this.orders.set(orderId, {
      orderId,
      bookingId: input.bookingId,
      amount: input.amount.amount,
      agentSharePct: input.agentSharePct,
      status: 'created',
      payoutStatus: 'none',
    });
    return { orderId, paymentSessionId: this.id('session'), status: 'created' };
  }

  async getPaymentStatus(orderId: string): Promise<PaymentStatus> {
    return this.orders.get(orderId)?.status ?? 'failed';
  }

  async releasePayout(input: PayoutInput): Promise<PayoutResult> {
    // Test double: a called release always succeeds (state may live in another
    // invocation). Retention is modeled by the loop never CALLING this, not here.
    const order = this.orders.get(input.orderId);
    if (order) order.payoutStatus = 'released';
    return { transferId: this.id('transfer'), status: 'released' };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const order = this.orders.get(input.orderId);
    if (order) order.status = 'refunded';
    return { refundId: this.id('refund'), status: 'refunded' };
  }

  // ── Deposit ────────────────────────────────────────────────────────────────

  async holdDeposit(input: DepositHoldInput): Promise<DepositHold> {
    const orderId = `deposit_${input.bookingId}`;
    this.deposits.set(orderId, 'held');
    return {
      depositId: orderId,
      orderId,
      paymentSessionId: this.id('session'),
      status: 'held',
    };
  }

  async releaseDeposit(input: DepositReleaseInput): Promise<DepositResult> {
    // PASS → full deposit back to donor; agent gets nothing from it.
    this.deposits.set(input.orderId, 'released');
    return { status: 'released', reference: this.id('release') };
  }

  async captureDepositForFailedTrip(input: DepositCaptureInput): Promise<DepositCaptureResult> {
    // FAIL → agent paid the minimum, remainder (if any) back to donor.
    this.deposits.set(input.orderId, 'captured');
    return {
      status: 'captured',
      agentPayout: { transferId: this.id('transfer'), status: 'released' },
      donorRefund: { refundId: this.id('refund'), status: 'refunded' },
    };
  }

  async getDepositStatus(depositId: string): Promise<DepositStatus> {
    return this.deposits.get(depositId) ?? 'none';
  }

  verifyWebhook(rawBody: string, _headers: Record<string, string>): WebhookEvent {
    // Tests pass a JSON body of our own WebhookEvent shape; echo it back.
    const parsed = JSON.parse(rawBody) as Partial<WebhookEvent>;
    return {
      type: parsed.type ?? 'unknown',
      orderId: parsed.orderId,
      bookingId: parsed.bookingId,
      raw: (parsed.raw ?? {}) as Record<string, unknown>,
    };
  }

  /** Test helper — mark a mock order as paid (simulates the donor completing payment). */
  markPaid(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order) order.status = 'paid';
  }
}
