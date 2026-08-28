import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import { matchTicketToOldestBooking } from './matching';

// A recipient joined the FIFO queue. If a verified booking is already waiting for
// a recipient, pair them immediately (the other matching direction).
export const onTicketCreated = onDocumentCreated('tickets/{ticketId}', async (event) => {
  const data = event.data?.data();
  if (data?.status !== 'waiting') return;
  await matchTicketToOldestBooking(event.params.ticketId);
});
