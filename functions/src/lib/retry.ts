// Small provider-agnostic retry helper with exponential backoff + jitter.
//
// NOTE: this module was missing from the repository snapshot even though
// `payments/providers/cashfree.ts` imports it (the build did not compile without
// it). It has been reconstructed from that single call site, which fully
// specifies the contract:
//
//   withRetry(attempt, { retries, baseDelayMs, maxDelayMs, isRetryable })
//
// `attempt` runs at most `retries + 1` times. Only errors for which
// `isRetryable` returns true are retried; everything else is rethrown at once.

export interface RetryOptions {
  /** Number of retries AFTER the first attempt (total tries = retries + 1). */
  retries: number;
  /** Base delay for the first backoff, in milliseconds. */
  baseDelayMs: number;
  /** Upper bound on any single backoff, in milliseconds. */
  maxDelayMs: number;
  /** Decide whether a thrown error is worth retrying. */
  isRetryable: (err: unknown) => boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > opts.retries || !opts.isRetryable(err)) {
        throw err;
      }
      // Exponential backoff (base * 2^(n-1)), capped, with up to 20% jitter.
      const backoff = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * backoff * 0.2;
      await sleep(backoff + jitter);
    }
  }
}
