@AGENTS.md

# Food-Donation App — Project Rules

## The core loop (MVP — the only thing we are building)

A donor books a pickup and **pays a refundable deposit up front** → a delivery agent
accepts and verifies edibility in person → then the loop forks on the edibility result:

- **Food PASSES** → the deposit is returned to the donor **instantly** → one recipient
  from a FIFO ticket queue is matched → donor pays the **ride fee** into escrow (SANDBOX
  only) → agent delivers → agent uploads proof of receipt → app releases agent's payout.
- **Food FAILS** → the deposit is **captured**: the agent is paid a fixed failed-trip
  minimum on the spot, any remainder returns to the donor. Terminal — no match, no ride.

The **deposit** and the **ride fee** are completely separate monies (see below).

## Deposit model (the edibility gate)

- The donor pays a **refundable deposit** at booking time, **before** the agent arrives.
- **Disclosure is required** at signup AND at booking: the deposit is **not** used for the
  delivery/ride fee, and is **returned instantly** the moment food passes the edibility
  check.
- **Passes** → deposit released back to the donor instantly. The ride is paid for
  **separately** afterwards (the escrow flow, once matched).
- **Fails** → deposit captured: the agent is paid a **fixed failed-trip minimum**
  (compensation for the wasted trip) out of it, and any remainder returns to the donor.
  The agent is paid on the spot.
- **Two config values, never hardcoded**, so they can be tuned:
  - `DEPOSIT_AMOUNT` — the deposit collected at booking.
  - `AGENT_FAILED_TRIP_MIN` — the agent's compensation on a failed trip.
  - **Invariant:** `DEPOSIT_AMOUNT >= AGENT_FAILED_TRIP_MIN` (validated at config load).
- Deposit money and ride money are **separate orders / separate ledgers** — never mixed.

### Deposit mechanism — branches by payment method (inside the Cashfree adapter only)

The loop calls `holdDeposit` / `releaseDeposit` / `captureDepositForFailedTrip` and stays
unaware of the mechanism. The UPI-vs-card branch lives entirely inside the adapter.

- **UPI** → pay-and-refund. Deposit is captured; on PASS it is **refunded**, on FAIL the
  agent-minimum is split to the agent and the remainder refunded to the donor.
  **Cashfree INSTANT refunds do NOT support UPI** — UPI refunds are STANDARD speed, so the
  copy must never promise "instant in account".
- **Card** → true **pre-auth** (`POST /orders/{id}/authorization`). On PASS, **VOID** the
  hold (no money ever leaves the donor). On FAIL, **CAPTURE** only the agent-minimum and
  void the rest.
- **Release endpoint** for a split is `POST /easy-split/orders/{id}/split` (Split After
  Payment), not the earlier guessed `/settle`.
- **Fallback:** if Cashfree sandbox card pre-auth is not enabled, treat cards like UPI
  (pay-and-refund) for the MVP. Acceptable fallback — note for v2, not a blocker.

### Disclosure copy — method-aware and truthful (never promise "instant in account")

- **UPI:** "Your deposit is refunded immediately the moment your food passes the edibility
  check. It typically reflects in your account within minutes, though timing can vary by
  bank."
- **Card:** the hold is released instantly with no charge.
- Shown at **signup** and at **booking**. Copy lives in one place and is method-aware.

## Parked for v2 — do NOT build

- Live GPS tracking
- Distance-based dynamic pricing
- The multi-warning fraud ledger
- Multi-source scaling

A flat / placeholder fee is fine for now.

## Committed stack

- **React Native + Expo** (already scaffolded). Expo has changed — read the versioned
  docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
- **Firebase**
  - **Auth** — 3 roles: `donor`, `agent`, `recipient`
  - **Firestore** — realtime state
  - **Storage** — proof-of-receipt uploads
  - **Cloud Functions** — server-side logic (see hard rule below)
- **Payments** — Razorpay or Cashfree, **SANDBOX / test mode only**.
  Provider is an **open decision**: recommend one with reasoning before wiring anything.

## Hard rule — server-side only

**FIFO matching, deposit hold/release/capture, escrow, and payout logic live ONLY in
Cloud Functions. Never on the client.** The client may read state and trigger these
flows, but must never compute the match, hold/release the deposit, hold/release escrow,
or issue a payout itself. All money moves through the provider-agnostic payments
interface — no gateway calls scattered through the loop.
