import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { db } from '../admin';
import { depositConfig } from '../config';
import { getPaymentProvider } from '../payments';
import { matchBookingToOldestTicket } from './matching';
import { appendPaymentEvent, ensureAgentVendor, now, requireRole } from './util';

/**
 * Agent verifies edibility in person. Forks the loop:
 *  - PASS → release the whole deposit to the donor, mark verified, try to match.
 *  - FAIL → capture the deposit: pay the agent the failed-trip minimum, return the
 *    remainder to the donor. Terminal (rejected). This is NOT a refund path.
 *
 * Deposit money moves ONLY here and in the webhook — never on the client.
 */
export const submitEdibility = onCall({ timeoutSeconds: 120 }, async (request) => {
  const uid = requireRole(request, 'agent');
  const bookingId = request.data?.bookingId as string | undefined;
  const passed = request.data?.passed as boolean | undefined;
  const photoUrl = request.data?.photoUrl as string | undefined;
  const note = request.data?.note as string | undefined;
  if (!bookingId || typeof passed !== 'boolean') {
    throw new HttpsError('invalid-argument', 'bookingId and passed are required.');
  }

  const ref = db.collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Booking not found.');
  const b = snap.data()!;
  if (b.agentId !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
  if (b.status !== 'agent_assigned') {
    throw new HttpsError('failed-precondition', `Booking is ${b.status}, not agent_assigned.`);
  }

  const provider = getPaymentProvider();
  const { deposit, agentFailedTripMin } = depositConfig();
  const orderId = b.deposit?.orderId as string;
  const edibility = { verified: passed, note: note ?? null, photoUrl: photoUrl ?? null, checkedAt: Date.now() };

  if (passed) {
    // PASS → return the whole deposit to the donor.
    await provider.releaseDeposit({ depositId: orderId, orderId, amount: deposit });
    await ref.update({
      edibility,
      status: 'verified',
      'deposit.state': 'released',
      'deposit.donorRefund': deposit.amount,
      updatedAt: now(),
    });
    await appendPaymentEvent(bookingId, 'refunded', deposit.amount, { reason: 'deposit-passed' });

    const matched = await matchBookingToOldestTicket(bookingId);
    return { passed: true, matched };
  }

  // FAIL → capture: agent minimum out of the deposit, remainder back to the donor.
  const remainder = deposit.amount - agentFailedTripMin.amount;
  const payeeId = await ensureAgentVendor(uid);
  const capture = await provider.captureDepositForFailedTrip({
    depositId: orderId,
    orderId,
    agentMinimum: agentFailedTripMin,
    donorRemainder: { amount: remainder, currency: 'INR' },
    payee: { providerPayeeId: payeeId },
  });

  await ref.update({
    edibility,
    status: 'rejected',
    'deposit.state': 'captured',
    'deposit.agentComp': agentFailedTripMin.amount,
    'deposit.donorRefund': remainder,
    updatedAt: now(),
  });
  await appendPaymentEvent(bookingId, 'payout_released', agentFailedTripMin.amount, {
    reason: 'failed-trip',
    agentPayout: capture.agentPayout,
    donorRefund: capture.donorRefund,
  });

  return { passed: false };
});
