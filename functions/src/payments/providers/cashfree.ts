import { createHmac, timingSafeEqual } from 'node:crypto';

import { withRetry } from '../../lib/retry';
import { PaymentRetryableError } from '../errors';
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
  WebhookEventType,
} from '../types';

// The ONLY file that knows Cashfree exists. All gateway field names, the Easy
// Split split object, the card pre-auth calls, and the webhook signature scheme
// are contained here. Thin REST adapter (no cashfree-pg SDK) so the boundary
// stays dependency-free. SANDBOX only — keys/base URL come from env.
//
// Endpoints verified against the current Cashfree PG + Easy Split reference:
//   create order      POST /orders
//   order payments    GET  /orders/{id}/payments
//   split (release)   POST /easy-split/orders/{id}/split        (Split After Payment)
//   refund            POST /orders/{id}/refunds
//   card auth/void    POST /orders/{id}/authorization           (action CAPTURE|VOID)
//   create vendor     POST /easy-split/vendors

const API_VERSION = '2023-08-01';

type PaymentMethod = 'upi' | 'card' | 'other';

type CashfreeConfig = {
  appId: string;
  secretKey: string;
  baseUrl: string; // e.g. https://sandbox.cashfree.com/pg
  /** If sandbox card pre-auth isn't enabled, treat cards like UPI (pay-and-refund). */
  cardPreAuthEnabled: boolean;
};

function configFromEnv(): CashfreeConfig {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;
  const baseUrl = process.env.CASHFREE_API_BASE ?? 'https://sandbox.cashfree.com/pg';
  const cardPreAuthEnabled = process.env.CASHFREE_CARD_PREAUTH !== 'false'; // default on
  if (!appId || !secretKey) {
    throw new Error('Cashfree not configured: set CASHFREE_APP_ID and CASHFREE_SECRET_KEY');
  }
  return { appId, secretKey, baseUrl, cardPreAuthEnabled };
}

export class CashfreeProvider implements PaymentProvider {
  readonly name = 'cashfree';

  private readonly config: CashfreeConfig;

  constructor(config?: CashfreeConfig) {
    this.config = config ?? configFromEnv();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        'x-client-id': this.config.appId,
        'x-client-secret': this.config.secretKey,
        'x-api-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : {};
    if (!res.ok) {
      const message = (json as { message?: string }).message ?? res.statusText;
      const label = `Cashfree ${method} ${path} failed (${res.status}): ${message}`;
      // Transient conditions worth retrying: server errors, rate limits, conflicts.
      const transient =
        res.status >= 500 || res.status === 429 || res.status === 409 || res.status === 425;
      throw transient ? new PaymentRetryableError(label) : new Error(label);
    }
    return json as T;
  }

  // ── Vendor onboarding ──────────────────────────────────────────────────────

  async registerPayee(input: RegisterPayeeInput): Promise<PayeeRef> {
    const body = {
      vendor_id: input.agentId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      // Sandbox test settlement target — no real bank data in test mode.
      bank: input.settlement?.accountNumber
        ? { account_number: input.settlement.accountNumber, ifsc: input.settlement.ifsc }
        : undefined,
      upi: input.settlement?.vpa ? { vpa: input.settlement.vpa } : undefined,
    };
    const res = await this.request<{ vendor_id: string }>('POST', '/easy-split/vendors', body);
    return { providerPayeeId: res.vendor_id };
  }

  // ── Ride escrow ────────────────────────────────────────────────────────────
  // Plain order at creation; the agent's share is split (released) only after
  // delivery via Split After Payment. No split = agent never paid (retention).

  async createEscrowOrder(input: EscrowOrderInput): Promise<PaymentOrder> {
    const orderId = `order_${input.bookingId}`;
    const res = await this.createOrder(orderId, input.amount.amount, input.donor, {
      bookingId: input.bookingId,
      kind: 'ride',
    });
    return {
      orderId,
      paymentSessionId: res.payment_session_id,
      status: mapOrderStatus(res.order_status),
    };
  }

  async getPaymentStatus(orderId: string): Promise<PaymentStatus> {
    const res = await this.request<{ order_status?: string }>('GET', `/orders/${orderId}`);
    return mapOrderStatus(res.order_status);
  }

  async releasePayout(input: PayoutInput): Promise<PayoutResult> {
    // Split After Payment: release the agent's share on the already-paid order.
    return this.splitToVendor(input.orderId, input.payee.providerPayeeId, input.amount.amount);
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const method = await this.detectMethod(input.orderId);
    return this.createRefund(input.orderId, input.amount.amount, method, input.reason ?? 'refund');
  }

  // ── Deposit (edibility gate) — UPI vs card branch lives here ────────────────

  async holdDeposit(input: DepositHoldInput): Promise<DepositHold> {
    const orderId = `deposit_${input.bookingId}`;
    // Manual capture lets a card authorize-without-capture (pre-auth). UPI ignores
    // it and captures normally; the resolve step reads back which happened.
    const res = await this.createOrder(orderId, input.deposit.amount, input.donor, {
      bookingId: input.bookingId,
      kind: 'deposit',
    });
    return {
      depositId: orderId,
      orderId,
      paymentSessionId: res.payment_session_id,
      status: 'held',
    };
  }

  async releaseDeposit(input: DepositReleaseInput): Promise<DepositResult> {
    const { method, isAuthOnly } = await this.readPayment(input.orderId);

    if (isAuthOnly && this.config.cardPreAuthEnabled) {
      // Card pre-auth PASS → void the hold; no money ever leaves the donor.
      await this.request('POST', `/orders/${input.orderId}/authorization`, { action: 'VOID' });
      return { status: 'released', reference: `void_${input.orderId}` };
    }

    // UPI / captured PASS → refund the full deposit.
    const refund = await this.createRefund(
      input.orderId,
      input.amount.amount,
      method,
      'deposit-passed',
    );
    return { status: 'released', reference: refund.refundId };
  }

  async captureDepositForFailedTrip(input: DepositCaptureInput): Promise<DepositCaptureResult> {
    const { method, isAuthOnly } = await this.readPayment(input.orderId);

    if (isAuthOnly && this.config.cardPreAuthEnabled) {
      // Card pre-auth FAIL → capture ONLY the agent minimum; the rest of the hold
      // is released to the donor automatically (never captured).
      await this.request('POST', `/orders/${input.orderId}/authorization`, {
        action: 'CAPTURE',
        amount: input.agentMinimum.amount,
      });
      const agentPayout = await this.splitToVendor(
        input.orderId,
        input.payee.providerPayeeId,
        input.agentMinimum.amount,
      );
      return { status: 'captured', agentPayout, donorRefund: noRefund(input.orderId) };
    }

    // UPI / captured FAIL → split agent minimum to the agent, refund remainder to donor.
    const agentPayout = await this.splitToVendor(
      input.orderId,
      input.payee.providerPayeeId,
      input.agentMinimum.amount,
    );
    const donorRefund =
      input.donorRemainder.amount > 0
        ? await this.createRefund(
            input.orderId,
            input.donorRemainder.amount,
            method,
            'deposit-failed-remainder',
          )
        : noRefund(input.orderId);
    return { status: 'captured', agentPayout, donorRefund };
  }

  async getDepositStatus(depositId: string): Promise<DepositStatus> {
    // Best-effort read-through; the loop's Firestore deposit sub-object is authoritative.
    const status = await this.getPaymentStatus(depositId);
    return status === 'paid' ? 'held' : 'none';
  }

  // ── Webhook ────────────────────────────────────────────────────────────────

  verifyWebhook(rawBody: string, headers: Record<string, string>): WebhookEvent {
    // Cashfree PG webhook signature: base64(HMAC_SHA256(secret, timestamp + rawBody)).
    const signature = headers['x-webhook-signature'] ?? '';
    const timestamp = headers['x-webhook-timestamp'] ?? '';
    const expected = createHmac('sha256', this.config.secretKey)
      .update(timestamp + rawBody)
      .digest('base64');

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('Cashfree webhook signature verification failed');
    }

    const payload = JSON.parse(rawBody) as {
      type?: string;
      data?: { order?: { order_id?: string; order_tags?: { bookingId?: string } } };
    };
    return {
      type: mapWebhookType(payload.type),
      orderId: payload.data?.order?.order_id,
      bookingId: payload.data?.order?.order_tags?.bookingId,
      raw: payload as Record<string, unknown>,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async createOrder(
    orderId: string,
    amount: number,
    donor: { id: string; email?: string; phone?: string },
    tags: Record<string, string>,
  ): Promise<{ payment_session_id: string; order_status?: string }> {
    return this.request('POST', '/orders', {
      order_id: orderId,
      order_amount: amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: donor.id,
        customer_email: donor.email,
        customer_phone: donor.phone,
      },
      order_tags: tags,
    });
  }

  private async splitToVendor(
    orderId: string,
    vendorId: string,
    amount: number,
  ): Promise<PayoutResult> {
    // Split After Payment is only valid ~2 min after payment confirmation, so
    // failures here are treated as transient and retried with backoff — never a
    // fixed blind wait. Bounded to ~a few minutes; the callable's timeout covers it.
    const attempt = async (): Promise<PayoutResult> => {
      try {
        const res = await this.request<{ status?: string; message?: string }>(
          'POST',
          `/easy-split/orders/${orderId}/split`,
          { split: [{ vendor_id: vendorId, amount }], disable_split: true },
        );
        if (res.status !== 'OK') {
          throw new PaymentRetryableError(`split not OK for ${orderId}: ${res.message ?? ''}`);
        }
        return { transferId: `split_${orderId}`, status: 'released' };
      } catch (err) {
        if (err instanceof PaymentRetryableError) throw err;
        // The split's time-gate can surface as a non-5xx error; retry those too.
        throw new PaymentRetryableError(err instanceof Error ? err.message : 'split failed');
      }
    };

    return withRetry(attempt, {
      retries: 6,
      baseDelayMs: 8_000,
      maxDelayMs: 45_000,
      isRetryable: (err) => err instanceof PaymentRetryableError,
    });
  }

  private async createRefund(
    orderId: string,
    amount: number,
    method: PaymentMethod,
    note: string,
  ): Promise<RefundResult> {
    // UPI cannot do INSTANT refunds — request STANDARD there, INSTANT elsewhere.
    const refund_speed = method === 'upi' ? 'STANDARD' : 'INSTANT';
    const refundId = `rfnd${orderId}${Date.now()}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
    const res = await this.request<{ refund_id?: string; refund_status?: string }>(
      'POST',
      `/orders/${orderId}/refunds`,
      { refund_amount: amount, refund_id: refundId, refund_note: note, refund_speed },
    );
    return {
      refundId: res.refund_id ?? refundId,
      status: res.refund_status === 'SUCCESS' ? 'refunded' : 'pending',
    };
  }

  private async readPayment(orderId: string): Promise<{ method: PaymentMethod; isAuthOnly: boolean }> {
    const payments = await this.request<
      Array<{ payment_method?: Record<string, unknown>; payment_status?: string; is_captured?: boolean }>
    >('GET', `/orders/${orderId}/payments`);
    const p = payments[0];
    const method = detectMethodFromPayload(p?.payment_method);
    // Card pre-auth = payment succeeded but not yet captured.
    const isAuthOnly = p?.payment_status === 'SUCCESS' && p?.is_captured === false;
    return { method, isAuthOnly };
  }

  private async detectMethod(orderId: string): Promise<PaymentMethod> {
    return (await this.readPayment(orderId)).method;
  }
}

function detectMethodFromPayload(pm: Record<string, unknown> | undefined): PaymentMethod {
  if (!pm) return 'other';
  if ('upi' in pm) return 'upi';
  if ('card' in pm) return 'card';
  return 'other';
}

function noRefund(orderId: string): RefundResult {
  return { refundId: `none_${orderId}`, status: 'refunded' };
}

function mapOrderStatus(status: string | undefined): PaymentStatus {
  switch (status) {
    case 'PAID':
      return 'paid';
    case 'ACTIVE':
      return 'created';
    case 'REFUNDED':
      return 'refunded';
    default:
      return status ? 'failed' : 'created';
  }
}

function mapWebhookType(type: string | undefined): WebhookEventType {
  switch (type) {
    case 'PAYMENT_SUCCESS_WEBHOOK':
      return 'payment.captured';
    case 'PAYMENT_FAILED_WEBHOOK':
      return 'payment.failed';
    case 'REFUND_STATUS_WEBHOOK':
      return 'refund.processed';
    case 'SETTLEMENT_WEBHOOK':
      return 'payout.settled';
    default:
      return 'unknown';
  }
}
