import { FieldValue } from 'firebase-admin/firestore';

import { db } from '../admin';

// FIFO matching lives ONLY here (server-side). Both entry points run inside a
// Firestore transaction over the oldest candidate so two writers can't claim the
// same ticket or booking. Ordering is by createdAt asc = FIFO.
//
// Requires composite indexes:
//   tickets:  status ASC, createdAt ASC
//   bookings: status ASC, createdAt ASC

const ts = () => FieldValue.serverTimestamp();

/**
 * A booking just passed edibility → claim the oldest waiting ticket for it.
 * Returns true if a recipient was matched.
 */
export async function matchBookingToOldestTicket(bookingId: string): Promise<boolean> {
  const bookingRef = db.collection('bookings').doc(bookingId);
  const oldestWaiting = db
    .collection('tickets')
    .where('status', '==', 'waiting')
    .orderBy('createdAt', 'asc')
    .limit(1);

  return db.runTransaction(async (tx) => {
    const booking = await tx.get(bookingRef);
    if (!booking.exists || booking.data()?.status !== 'verified') return false;

    const tickets = await tx.get(oldestWaiting);
    const ticket = tickets.docs[0];
    if (!ticket) return false;

    tx.update(ticket.ref, { status: 'matched', matchedBookingId: bookingId });
    tx.update(bookingRef, {
      recipientId: ticket.data().recipientId,
      ticketId: ticket.id,
      status: 'matched',
      updatedAt: ts(),
    });
    return true;
  });
}

/**
 * A ticket was just created → claim the oldest verified-but-unmatched booking.
 * Returns true if it was paired.
 */
export async function matchTicketToOldestBooking(ticketId: string): Promise<boolean> {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const oldestVerified = db
    .collection('bookings')
    .where('status', '==', 'verified')
    .orderBy('createdAt', 'asc')
    .limit(1);

  return db.runTransaction(async (tx) => {
    const ticket = await tx.get(ticketRef);
    if (!ticket.exists || ticket.data()?.status !== 'waiting') return false;

    const bookings = await tx.get(oldestVerified);
    const booking = bookings.docs[0];
    if (!booking) return false;

    tx.update(booking.ref, {
      recipientId: ticket.data()?.recipientId,
      ticketId,
      status: 'matched',
      updatedAt: ts(),
    });
    tx.update(ticketRef, { status: 'matched', matchedBookingId: booking.id });
    return true;
  });
}
