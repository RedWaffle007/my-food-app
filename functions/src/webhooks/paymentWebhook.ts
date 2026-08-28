import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

import { db } from '../admin';
import { getPaymentProvider } from '../payments';
import type { PaymentEventType, WebhookEventType } from '../payments';
import { appendPaymentEvent, now } from '../loop/util';

// Thin webhook: verify the signature via the adapter, then apply the normalized
// event to Firestore. Payment confirmation (capture) is what flips a booking into
// deposit_held / escrow_held — the client never writes those transitions.
export const paymentWebhook = onRequest(async (req, res) => {
  const provider = getPaymentProvider();
  const raw = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);

  let event;
  try {
    event = provider.verifyWebhook(raw, req.headers as Record<string, string>);
  } catch (err) {
    logger.warn('Rejected webhook: signature verification failed', err);
    res.status(400).send('invalid signature');
    return;
  }

  const orderId = event.orderId ?? '';
  const bookingId = event.bookingId ?? deriveBookingId(orderId);

  if (bookingId && event.type === 'payment.captured') {
    const isDeposit = orderId.startsWith('deposit_');
    const ref = db.collection('bookings').doc(bookingId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const b = snap.data()!;
      if (isDeposit && b.status === 'requested') {
        tx.update(ref, { status: 'deposit_held', 'deposit.state': 'held', updatedAt: now() });
      } else if (!isDeposit && b.status === 'matched') {
        tx.update(ref, { status: 'escrow_held', 'payment.state': 'escrow_held', updatedAt: now() });
      }
    });
  }

  if (bookingId) {
    await appendPaymentEvent(bookingId, mapEventType(event.type), undefined, event.raw);
  }

  res.status(200).send('ok');
});

/** Order ids are `deposit_<bookingId>` / `order_<bookingId>` — recover the booking id. */
function deriveBookingId(orderId: string): string {
  return orderId.replace(/^(deposit|order)_/, '');
}

function mapEventType(type: WebhookEventType): PaymentEventType {
  switch (type) {
    case 'payment.captured':
      return 'escrow_held';
    case 'refund.processed':
      return 'refunded';
    case 'payout.settled':
      return 'payout_released';
    default:
      return 'webhook';
  }
}
