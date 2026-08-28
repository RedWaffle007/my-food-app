// Provider-agnostic transient-failure signal. The adapter throws this for
// conditions worth retrying (e.g. Cashfree's Split-After-Payment ~2-min gate,
// 5xx, rate limits). Callers key their retry policy off this type — never off
// gateway error strings or HTTP codes.
export class PaymentRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRetryableError';
  }
}
