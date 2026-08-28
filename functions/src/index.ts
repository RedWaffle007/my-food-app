// Cloud Functions entry point. All matching / deposit / escrow / payout logic is
// server-side only (CLAUDE.md hard rule); the client just calls these.

export { setRole } from './loop/roles';
export { bookPickup, acceptPickup } from './loop/bookings';
export { submitEdibility } from './loop/edibility';
export { payRide, uploadProof, retryPayout } from './loop/ride';
export { onTicketCreated } from './loop/tickets';
export { paymentWebhook } from './webhooks/paymentWebhook';
