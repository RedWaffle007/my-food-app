import type { PaymentProvider } from '../provider';
import { PaymentRetryableError } from '../errors';
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

/**
 * Adapter that routes money operations to the standalone ASP.NET Core payment/
 * ledger microservice (see ../../../dotnet-payments/). This is the polyglot
 * integration boundary: the Firebase functions stay the orchestration layer and
 * the client never moves money, but the actual escrow/deposit/payout/ledger and
 * webhook handling live in the .NET trust boundary, called over authenticated
 * HTTP.
 *
 * Select it with PAYMENTS_PROVIDER=dotnet. No loop code changes — it implements
 * the same PaymentProvider interface as the mock and Cashfree adapters.
 *
 * Config (env):
 *   DOTNET_PAYMENTS_URL      base URL of the .NET service (e.g. http://localhost:5090)
 *   DOTNET_PAYMENTS_API_KEY  shared X-Api-Key for service-to-service auth (optional)
 */
export class DotNetPaymentProvider implements PaymentProvider {
  readonly name = 'dotnet';

  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor() {
    this.baseUrl = (process.env.DOTNET_PAYMENTS_URL ?? 'http://localhost:5090').replace(/\/$/, '');
    this.apiKey = process.env.DOTNET_PAYMENTS_API_KEY || undefined;
  }

  async registerPayee(input: RegisterPayeeInput): Promise<PayeeRef> {
    const r = await this.call<{ providerPayeeId: string }>('POST', '/api/payees', {
      agentId: input.agentId,
      name: input.name,
      email: input.email,
      phone: input.phone,
    });
    return { providerPayeeId: r.providerPayeeId };
  }

  async holdDeposit(input: DepositHoldInput): Promise<DepositHold> {
    const o = await this.call<OrderResponse>('POST', '/api/deposits', {
      bookingId: input.bookingId,
      donorId: input.donor.id,
      donorEmail: input.donor.email,
      donorPhone: input.donor.phone,
    }, `deposit_${input.bookingId}`);
    return {
      depositId: o.orderId,
      orderId: o.orderId,
      paymentSessionId: o.paymentSessionId ?? '',
      status: mapDepositState(o.depositState),
    };
  }

  async releaseDeposit(input: DepositReleaseInput): Promise<DepositResult> {
    const bookingId = deriveBookingId(input.orderId);
    const o = await this.call<OrderResponse>('POST', `/api/deposits/${bookingId}/release`, {},
      `release_${input.orderId}`);
    return { status: mapDepositState(o.depositState), reference: o.orderId };
  }

  async captureDepositForFailedTrip(input: DepositCaptureInput): Promise<DepositCaptureResult> {
    const bookingId = deriveBookingId(input.orderId);
    const o = await this.call<OrderResponse>('POST', `/api/deposits/${bookingId}/capture`, {
      agentId: agentIdFromPayee(input.payee),
    }, `capture_${input.orderId}`);
    return {
      status: mapDepositState(o.depositState),
      agentPayout: { transferId: o.orderId, status: 'released' },
      donorRefund: { refundId: o.orderId, status: 'refunded' },
    };
  }

  async getDepositStatus(depositId: string): Promise<DepositStatus> {
    const o = await this.call<OrderResponse>('GET', `/api/orders/${depositId}`);
    return mapDepositState(o.depositState);
  }

  async createEscrowOrder(input: EscrowOrderInput): Promise<PaymentOrder> {
    const o = await this.call<OrderResponse>('POST', '/api/orders', {
      bookingId: input.bookingId,
      donorId: input.donor.id,
      agentId: agentIdFromPayee(input.payee),
      donorEmail: input.donor.email,
      donorPhone: input.donor.phone,
    }, `order_${input.bookingId}`);
    return {
      orderId: o.orderId,
      paymentSessionId: o.paymentSessionId ?? '',
      status: mapPaymentStatus(o.status),
    };
  }

  async getPaymentStatus(orderId: string): Promise<PaymentStatus> {
    const o = await this.call<OrderResponse>('GET', `/api/orders/${orderId}`);
    return mapPaymentStatus(o.status);
  }

  async releasePayout(input: PayoutInput): Promise<PayoutResult> {
    const o = await this.call<OrderResponse>('POST', `/api/orders/${input.bookingId}/payout`, {
      bookingId: input.bookingId,
      agentId: agentIdFromPayee(input.payee),
    }, `payout_${input.orderId}`);
    return { transferId: o.orderId, status: o.payoutState === 'Released' ? 'released' : 'pending' };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const o = await this.call<OrderResponse>('POST', `/api/orders/${input.orderId}/refund`, {
      amount: input.amount.amount,
      reason: input.reason,
    }, `refund_${input.orderId}`);
    return { refundId: o.orderId, status: 'refunded' };
  }

  verifyWebhook(_rawBody: string, _headers: Record<string, string>): WebhookEvent {
    // In the .NET architecture the gateway webhook is delivered directly to the
    // .NET service (POST /api/webhooks/payments), which verifies the signature and
    // updates the ledger. It is never verified here.
    throw new Error('Webhooks are handled by the .NET payment service, not this adapter.');
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new PaymentRetryableError(`.NET payment service unreachable: ${String(err)}`);
    }

    if (res.status >= 500 || res.status === 429) {
      throw new PaymentRetryableError(`.NET payment service ${res.status}`);
    }
    if (!res.ok) {
      throw new Error(`.NET payment service ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }
}

// ── Response shape + status mapping (.NET PascalCase enums → provider types) ───

type OrderResponse = {
  orderId: string;
  bookingId: string;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  depositState: string;
  payoutState: string;
  paymentSessionId?: string | null;
};

function deriveBookingId(orderId: string): string {
  return orderId.replace(/^(deposit|order)_/, '');
}

// The mock/Cashfree adapters use providerPayeeId = `vendor_<agentId>`; the .NET
// service keys payouts by agentId, so recover it from that convention.
function agentIdFromPayee(payee: PayeeRef): string {
  return payee.providerPayeeId.replace(/^vendor_/, '');
}

function mapDepositState(s: string): DepositStatus {
  switch (s) {
    case 'Held': return 'held';
    case 'Released': return 'released';
    case 'Captured': return 'captured';
    default: return 'none';
  }
}

function mapPaymentStatus(s: string): PaymentStatus {
  switch (s) {
    case 'Paid': return 'paid';
    case 'Refunded': return 'refunded';
    case 'Created': return 'created';
    default: return 'failed';
  }
}
