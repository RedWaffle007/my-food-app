// Data model for the `tickets` collection — the FIFO recipient queue.
// Match logic (pick oldest `waiting` in a transaction) lives ONLY in a Cloud
// Function; `status: 'matched'` and `matchedBookingId` are server-owned.

export type TicketStatus =
  | 'waiting' // in the FIFO queue
  | 'matched' // picked by the match function (server)
  | 'fulfilled' // delivery completed
  | 'expired'
  | 'cancelled';

export type Ticket = {
  id: string;
  recipientId: string;
  status: TicketStatus;
  /** FIFO key — the match function picks the oldest `waiting` ticket by this. */
  createdAt: number; // server timestamp
  matchedBookingId: string | null; // server-owned
};
