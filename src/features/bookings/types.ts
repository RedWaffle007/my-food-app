// Data model for the `bookings` collection — the spine of the core loop.
// Types only; no reads/writes here. Server-owned fields are marked; the client
// must never write them (enforced by Firestore security rules in a later step).

import type { Role } from '@/providers/auth-provider';

export type BookingStatus =
  | 'requested' // donor booked the pickup
  | 'deposit_held' // donor paid the refundable deposit (server)
  | 'agent_assigned' // an agent accepted
  | 'verified' // edibility passed → deposit released to donor (server)
  | 'rejected' // edibility failed → deposit captured, agent min paid → terminal
  | 'matched' // one FIFO recipient matched (server)
  | 'escrow_held' // donor paid the ride fee into escrow, sandbox (server)
  | 'delivered' // agent delivered + uploaded proof
  | 'completed' // payout released (server) → terminal
  | 'cancelled';

/** Deposit lifecycle (the edibility gate). Separate money from the ride escrow. */
export type DepositState = 'none' | 'held' | 'released' | 'captured';

/** Server-owned. Written only by Cloud Functions. */
export type Deposit = {
  state: DepositState;
  amount: number; // config: DEPOSIT_AMOUNT
  agentComp?: number; // paid to agent on a failed trip (config: AGENT_FAILED_TRIP_MIN)
  donorRefund?: number; // returned to donor (full on pass, remainder on fail)
  orderId?: string;
};

export type PaymentState =
  | 'none'
  | 'created'
  | 'escrow_held'
  | 'released'
  | 'refunded';

export type PayoutState = 'pending' | 'released' | 'failed';

export type Food = {
  description: string;
  quantity: string;
  preparedAt: number; // epoch ms
  pickupAddress: string;
  pickupWindow: { start: number; end: number };
};

export type Edibility = {
  verified: boolean;
  note?: string;
  photoUrl?: string;
  checkedAt: number;
};

/** Server-owned. Written only by Cloud Functions. */
export type Payment = {
  provider?: 'razorpay' | 'cashfree'; // decided in a later step
  orderId?: string;
  gatewayPaymentId?: string;
  amount: number;
  state: PaymentState;
  heldAt?: number;
  releasedAt?: number;
};

/** Server-owned. Written only by Cloud Functions. */
export type Payout = {
  state: PayoutState;
  transferId?: string;
  amount: number;
  releasedAt?: number;
};

export type Proof = {
  photoUrl: string;
  uploadedAt: number;
  note?: string;
};

export type Booking = {
  id: string;
  donorId: string;
  agentId: string | null;
  recipientId: string | null; // set by the match function (server)
  ticketId: string | null; // set by the match function (server)
  status: BookingStatus;
  food: Food;
  edibility: Edibility | null;
  deposit: Deposit; // server-owned — the edibility gate, separate from the ride fee
  fee: number; // ride fee — flat / placeholder for MVP
  payment: Payment; // server-owned — ride escrow
  proof: Proof | null;
  payout: Payout; // server-owned
  createdAt: number;
  updatedAt: number;
};

// Re-export for convenience where booking code touches roles.
export type { Role };
