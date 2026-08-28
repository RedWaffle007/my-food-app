// Method-aware deposit disclosure copy. Single source of truth — shown at signup
// AND at booking (CLAUDE.md requires it in both places). Must stay truthful:
// never promise the refund is "instant in account" for UPI.

export type DepositMethod = 'upi' | 'card';

/** Shown before a payment method is chosen (signup, booking intro). */
export const DEPOSIT_DISCLOSURE_GENERIC =
  'This deposit is a separate, refundable hold — it is never used for the delivery ' +
  'fee. It is returned the moment your food passes the edibility check.';

/** Shown once the donor's method is known. UPI copy is deliberately not "instant". */
export const DEPOSIT_DISCLOSURE: Record<DepositMethod, string> = {
  upi:
    'Your deposit is refunded immediately the moment your food passes the edibility ' +
    'check. It typically reflects in your account within minutes, though timing can ' +
    'vary by bank.',
  card:
    'We only place a temporary hold on your card for the deposit — nothing is charged. ' +
    'The hold is released instantly when your food passes the edibility check.',
};
