// End-to-end loop test against the Firebase emulators with the mock payment
// provider (no Cashfree calls). Exercises: setRole → recipient ticket → bookPickup
// → deposit webhook → accept → edibility PASS → FIFO match → payRide → ride webhook
// → uploadProof → payout, plus the edibility FAIL/capture branch.
//
// Assumes emulators are already running (auth, functions, firestore).

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const PROJECT = 'demo-my-food-app';
const REGION = 'us-central1';
const FN_BASE = `http://127.0.0.1:5001/${PROJECT}/${REGION}`;
const AUTH_REST = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;

initializeApp({ projectId: PROJECT });
const db = getFirestore();

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

async function signIn(email, password) {
  const res = await fetch(`${AUTH_REST}/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await res.json();
  if (!j.idToken) throw new Error(`signIn failed: ${JSON.stringify(j)}`);
  return j.idToken;
}

async function callable(name, token, data) {
  const res = await fetch(`${FN_BASE}/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${name} error: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function webhook(event) {
  const res = await fetch(`${FN_BASE}/paymentWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`webhook failed (${res.status}): ${await res.text()}`);
}

async function makeUser(email, role) {
  await getAuth().createUser({ email, password: 'password123', displayName: `${role}-user` });
  const token0 = await signIn(email, 'password123');
  await callable('setRole', token0, { role }); // sets the custom claim
  return { token: await signIn(email, 'password123') }; // refreshed token carries the claim
}

const booking = (id) => db.collection('bookings').doc(id).get().then((s) => s.data());
const ticket = (id) => db.collection('tickets').doc(id).get().then((s) => s.data());

async function waitFor(desc, fn, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${desc}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

const sampleFood = () => ({
  description: 'Vegetable biryani',
  quantity: '12 meal boxes',
  preparedAt: Date.now(),
  pickupAddress: '123 Market St',
  pickupWindow: { start: Date.now(), end: Date.now() + 3_600_000 },
});

const RUN = Date.now(); // unique per run so the script can be re-run on a live emulator

async function main() {
  console.log('Setting up users + roles...');
  const donor = await makeUser(`donor-${RUN}@test.dev`, 'donor');
  const agent = await makeUser(`agent-${RUN}@test.dev`, 'agent');
  await makeUser(`recipient-${RUN}@test.dev`, 'recipient');
  assert(true, 'setRole set claims for donor, agent, recipient');

  // ── Happy path ─────────────────────────────────────────────────────────────
  console.log('\nHappy path (edibility PASS → delivery → payout):');

  const recipientUid = (await getAuth().getUserByEmail(`recipient-${RUN}@test.dev`)).uid;
  const ticketRef = db.collection('tickets').doc();
  await ticketRef.set({
    recipientId: recipientUid,
    status: 'waiting',
    createdAt: FieldValue.serverTimestamp(),
    matchedBookingId: null,
  });

  const { bookingId } = await callable('bookPickup', donor.token, { food: sampleFood() });
  assert(!!bookingId, 'bookPickup created a booking');

  await webhook({ type: 'payment.captured', orderId: `deposit_${bookingId}`, bookingId, raw: {} });
  await waitFor('deposit_held', async () => (await booking(bookingId)).status === 'deposit_held');
  assert(true, 'deposit webhook → status deposit_held');

  await callable('acceptPickup', agent.token, { bookingId });
  await waitFor('agent_assigned', async () => (await booking(bookingId)).status === 'agent_assigned');
  assert(true, 'acceptPickup → status agent_assigned');

  await callable('submitEdibility', agent.token, { bookingId, passed: true, note: 'looks good' });
  await waitFor('matched', async () => {
    const b = await booking(bookingId);
    return b.status === 'matched' && b.deposit.state === 'released';
  });
  const matchedBooking = await booking(bookingId);
  assert(matchedBooking.deposit.state === 'released', 'edibility PASS → deposit released to donor');
  assert(matchedBooking.recipientId === recipientUid, 'FIFO matched the waiting recipient');
  assert((await ticket(ticketRef.id)).status === 'matched', 'ticket flipped to matched');

  await callable('payRide', donor.token, { bookingId });
  await webhook({ type: 'payment.captured', orderId: `order_${bookingId}`, bookingId, raw: {} });
  await waitFor('escrow_held', async () => (await booking(bookingId)).status === 'escrow_held');
  assert(true, 'ride webhook → status escrow_held');

  await callable('uploadProof', agent.token, {
    bookingId,
    photoUrl: `proofs/${bookingId}/receipt.jpg`,
  });
  await waitFor('completed', async () => {
    const b = await booking(bookingId);
    return b.status === 'completed' && b.payout.state === 'released';
  });
  const done = await booking(bookingId);
  assert(done.status === 'completed', 'uploadProof → payout released → status completed');
  assert(done.payout.amount === 64, 'agent payout = 80% of 80 ride fee = 64');

  // ── Failed-trip path ───────────────────────────────────────────────────────
  console.log('\nFailed-trip path (edibility FAIL → deposit captured):');

  const { bookingId: b2 } = await callable('bookPickup', donor.token, { food: sampleFood() });
  await webhook({ type: 'payment.captured', orderId: `deposit_${b2}`, bookingId: b2, raw: {} });
  await waitFor('deposit_held', async () => (await booking(b2)).status === 'deposit_held');
  await callable('acceptPickup', agent.token, { bookingId: b2 });
  await waitFor('agent_assigned', async () => (await booking(b2)).status === 'agent_assigned');
  await callable('submitEdibility', agent.token, { bookingId: b2, passed: false, note: 'temp fail' });
  await waitFor('rejected', async () => {
    const b = await booking(b2);
    return b.status === 'rejected' && b.deposit.state === 'captured';
  });
  const failed = await booking(b2);
  assert(failed.deposit.agentComp === 60, 'failed trip → agent comp = 60 (config min)');
  assert(failed.deposit.donorRefund === 140, 'failed trip → donor remainder = 200 - 60 = 140');

  console.log(`\n✅ ALL ${passed} ASSERTIONS PASSED — loop runs end-to-end on the mock provider.`);
}

main().catch((err) => {
  console.error(`\n❌ ${err.message}`);
  process.exit(1);
});
