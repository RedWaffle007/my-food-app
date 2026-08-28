import type { Money } from './payments/types';

// Tunable money config. Read from env — never hardcoded in the loop. The loop
// reads these and passes amounts into the provider; the provider stays
// amount-driven and config-agnostic.

export type DepositConfig = {
  /** Refundable deposit collected from the donor at booking. */
  deposit: Money;
  /** Fixed compensation paid to the agent from the deposit on a failed trip. */
  agentFailedTripMin: Money;
};

function readAmount(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Config ${name} must be a non-negative number, got "${raw}"`);
  }
  return n;
}

/**
 * Deposit config with the hard invariant enforced at load:
 *   DEPOSIT_AMOUNT >= AGENT_FAILED_TRIP_MIN
 * so a failed trip can always pay the agent's minimum out of the deposit.
 */
export function depositConfig(): DepositConfig {
  const deposit = readAmount('DEPOSIT_AMOUNT_INR', 200);
  const agentFailedTripMin = readAmount('AGENT_FAILED_TRIP_MIN_INR', 60);

  if (deposit <= 0) {
    throw new Error('DEPOSIT_AMOUNT_INR must be greater than 0');
  }
  if (deposit < agentFailedTripMin) {
    throw new Error(
      `DEPOSIT_AMOUNT_INR (${deposit}) must be >= AGENT_FAILED_TRIP_MIN_INR (${agentFailedTripMin})`,
    );
  }

  return {
    deposit: { amount: deposit, currency: 'INR' },
    agentFailedTripMin: { amount: agentFailedTripMin, currency: 'INR' },
  };
}

export type RideConfig = {
  /** Flat ride fee the donor pays into escrow after a match (placeholder for MVP). */
  fee: Money;
  /** Agent's percentage of the ride fee; the platform keeps the rest. */
  agentSharePct: number;
};

export function rideConfig(): RideConfig {
  const fee = readAmount('RIDE_FEE_INR', 80);
  const agentSharePct = readAmount('AGENT_RIDE_SHARE_PCT', 80);

  if (fee <= 0) {
    throw new Error('RIDE_FEE_INR must be greater than 0');
  }
  if (agentSharePct < 0 || agentSharePct > 100) {
    throw new Error(`AGENT_RIDE_SHARE_PCT must be between 0 and 100, got ${agentSharePct}`);
  }

  return { fee: { amount: fee, currency: 'INR' }, agentSharePct };
}
