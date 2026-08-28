import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { db } from '../admin';
import { depositConfig } from '../config';
import { getPaymentProvider } from '../payments';
import { ensureAgentVendor, getUser, now, requireAuth, requireRole } from './util';

type FoodInput = {
  description: string;
  quantity: string;
  preparedAt: number;
  pickupAddress: string;
  pickupWindow: { start: number; end: number };
};

/**
 * Donor books a pickup and gets a deposit payment session. The booking starts as
 * `requested` with deposit.state `none`; it flips to `deposit_held` only when the
 * payment webhook confirms capture. Client opens `paymentSessionId` to pay.
 */
export const bookPickup = onCall(async (request) => {
  const uid = requireAuth(request);
  const food = request.data?.food as FoodInput | undefined;
  if (!food?.description) {
    throw new HttpsError('invalid-argument', 'A food description is required.');
  }

  const provider = getPaymentProvider();
  const { deposit } = depositConfig();
  const donor = await getUser(uid);

  const bookingRef = db.collection('bookings').doc();
  await bookingRef.set({
    donorId: uid,
    agentId: null,
    recipientId: null,
    ticketId: null,
    status: 'requested',
    food,
    edibility: null,
    deposit: { state: 'none', amount: deposit.amount },
    fee: 0,
    payment: { state: 'none', amount: 0 },
    proof: null,
    payout: { state: 'pending', amount: 0 },
    createdAt: now(),
    updatedAt: now(),
  });

  const hold = await provider.holdDeposit({
    bookingId: bookingRef.id,
    deposit,
    donor: { id: uid, email: donor.email, phone: donor.phone },
  });

  await bookingRef.update({ 'deposit.orderId': hold.orderId, updatedAt: now() });

  return { bookingId: bookingRef.id, paymentSessionId: hold.paymentSessionId };
});

/**
 * Agent accepts a booking whose deposit is held. First-writer-wins via a
 * transaction; also ensures the agent is registered as a payee up front.
 */
export const acceptPickup = onCall(async (request) => {
  const uid = requireRole(request, 'agent');
  const bookingId = request.data?.bookingId as string | undefined;
  if (!bookingId) throw new HttpsError('invalid-argument', 'bookingId is required.');

  const ref = db.collection('bookings').doc(bookingId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Booking not found.');
    const b = snap.data()!;
    if (b.status !== 'deposit_held') {
      throw new HttpsError('failed-precondition', `Booking is ${b.status}, not deposit_held.`);
    }
    if (b.agentId) throw new HttpsError('already-exists', 'Booking already has an agent.');
    tx.update(ref, { agentId: uid, status: 'agent_assigned', updatedAt: now() });
  });

  await ensureAgentVendor(uid);
  return { ok: true };
});
