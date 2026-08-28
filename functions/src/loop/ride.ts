import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { db } from '../admin';
import { rideConfig } from '../config';
import { getPaymentProvider } from '../payments';
import { appendPaymentEvent, ensureAgentVendor, getUser, now, requireAuth, requireRole } from './util';

/**
 * Donor pays the ride fee into escrow after a match. Creates the escrow order and
 * returns a payment session; the booking flips to `escrow_held` on the webhook.
 */
export const payRide = onCall(async (request) => {
  const uid = requireAuth(request);
  const bookingId = request.data?.bookingId as string | undefined;
  if (!bookingId) throw new HttpsError('invalid-argument', 'bookingId is required.');

  const ref = db.collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Booking not found.');
  const b = snap.data()!;
  if (b.donorId !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
  if (b.status !== 'matched') {
    throw new HttpsError('failed-precondition', `Booking is ${b.status}, not matched.`);
  }

  const { fee, agentSharePct } = rideConfig();
  const donor = await getUser(uid);
  const payeeId = await ensureAgentVendor(b.agentId);
  const provider = getPaymentProvider();

  const order = await provider.createEscrowOrder({
    bookingId,
    amount: fee,
    agentSharePct,
    donor: { id: uid, email: donor.email, phone: donor.phone },
    payee: { providerPayeeId: payeeId },
  });

  await ref.update({
    fee: fee.amount,
    'payment.orderId': order.orderId,
    'payment.amount': fee.amount,
    'payment.state': 'created',
    updatedAt: now(),
  });

  return { paymentSessionId: order.paymentSessionId, orderId: order.orderId };
});

/**
 * Agent uploads proof of receipt → the delivery is complete → release the agent's
 * payout. The release goes through Split After Payment, whose ~2-min gate is
 * handled by retry/backoff inside the adapter. If the release still doesn't land,
 * the booking stays `delivered` with payout `pending` and `retryPayout` can finish it.
 */
export const uploadProof = onCall({ timeoutSeconds: 300 }, async (request) => {
  const uid = requireRole(request, 'agent');
  const bookingId = request.data?.bookingId as string | undefined;
  const photoUrl = request.data?.photoUrl as string | undefined;
  if (!bookingId || !photoUrl) {
    throw new HttpsError('invalid-argument', 'bookingId and photoUrl are required.');
  }

  const ref = db.collection('bookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Booking not found.');
  const b = snap.data()!;
  if (b.agentId !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
  if (b.status !== 'escrow_held') {
    throw new HttpsError('failed-precondition', `Booking is ${b.status}, not escrow_held.`);
  }

  await ref.update({
    proof: { photoUrl, uploadedAt: Date.now() },
    status: 'delivered',
    updatedAt: now(),
  });

  return releasePayoutFor(bookingId);
});

/**
 * Re-attempt the payout for a delivered booking whose release didn't complete
 * (e.g. the Split-After-Payment gate outlasted the retry budget). Idempotent-ish:
 * only acts while the booking is `delivered` and the payout isn't yet released.
 */
export const retryPayout = onCall({ timeoutSeconds: 300 }, async (request) => {
  const uid = requireRole(request, 'agent');
  const bookingId = request.data?.bookingId as string | undefined;
  if (!bookingId) throw new HttpsError('invalid-argument', 'bookingId is required.');

  const snap = await db.collection('bookings').doc(bookingId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Booking not found.');
  const b = snap.data()!;
  if (b.agentId !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
  if (b.status !== 'delivered' || b.payout?.state === 'released') {
    throw new HttpsError('failed-precondition', 'No pending payout to retry.');
  }

  return releasePayoutFor(bookingId);
});

async function releasePayoutFor(bookingId: string): Promise<{ released: boolean }> {
  const ref = db.collection('bookings').doc(bookingId);
  const b = (await ref.get()).data()!;

  const { fee, agentSharePct } = rideConfig();
  const agentAmount = Math.round((fee.amount * agentSharePct) / 100);
  const payeeId = await ensureAgentVendor(b.agentId);
  const provider = getPaymentProvider();

  const payout = await provider.releasePayout({
    bookingId,
    orderId: b.payment.orderId,
    payee: { providerPayeeId: payeeId },
    amount: { amount: agentAmount, currency: 'INR' },
  });

  const released = payout.status === 'released';
  await ref.update({
    'payout.state': released ? 'released' : 'pending',
    'payout.transferId': payout.transferId,
    'payout.amount': agentAmount,
    'payout.releasedAt': released ? Date.now() : null,
    ...(released ? { status: 'completed' } : {}),
    updatedAt: now(),
  });

  if (released) {
    await appendPaymentEvent(bookingId, 'payout_released', agentAmount, { transferId: payout.transferId });
  }
  return { released };
}
