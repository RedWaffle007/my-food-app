import type { PaymentProvider } from './provider';
import { CashfreeProvider } from './providers/cashfree';
import { DotNetPaymentProvider } from './providers/dotnet';
import { MockPaymentProvider } from './providers/mock';

export type { PaymentProvider } from './provider';
export * from './types';
export { PaymentRetryableError } from './errors';

let cached: PaymentProvider | undefined;

/**
 * Resolve the active provider from env. `mock` runs in the emulator/tests so the
 * loop is exercisable without hitting Cashfree. This factory is the only place
 * that names concrete providers — the loop calls getPaymentProvider() and holds
 * a PaymentProvider.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const which = process.env.PAYMENTS_PROVIDER ?? 'cashfree';
  switch (which) {
    case 'mock':
      cached = new MockPaymentProvider();
      break;
    case 'cashfree':
      cached = new CashfreeProvider();
      break;
    case 'dotnet':
      // Route money operations to the ASP.NET Core payment/ledger microservice.
      cached = new DotNetPaymentProvider();
      break;
    default:
      throw new Error(`Unknown PAYMENTS_PROVIDER: "${which}" (expected "cashfree", "mock" or "dotnet")`);
  }
  return cached;
}

/** Test hook: drop the cached instance so a test can switch providers. */
export function resetPaymentProvider(): void {
  cached = undefined;
}
