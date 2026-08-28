import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { db } from '../admin';
import { getPaymentProvider } from '../payments';
import type { PaymentEventType } from '../payments';

export const now = () => FieldValue.serverTimestamp();

export type Role = 'donor' | 'agent' | 'recipient';

/** Require a signed-in caller; returns their uid. */
export function requireAuth(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return uid;
}

/** Require a signed-in caller holding a specific role claim; returns their uid. */
export function requireRole(request: CallableRequest, role: Role): string {
  const uid = requireAuth(request);
  const claim = request.auth?.token?.role;
  if (claim !== role) {
    throw new HttpsError('permission-denied', `This action requires the ${role} role.`);
  }
  return uid;
}

export type UserContact = { name: string; email?: string; phone?: string; providerPayeeId?: string };

export async function getUser(uid: string): Promise<UserContact> {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data() ?? {};
  return {
    name: (data.displayName as string) ?? uid,
    email: data.email as string | undefined,
    phone: data.phone as string | undefined,
    providerPayeeId: data.providerPayeeId as string | undefined,
  };
}

/**
 * Ensure the agent is registered as a payee/vendor with the provider, so their
 * share can be split to them. Idempotent — caches the id on the user doc.
 */
export async function ensureAgentVendor(agentId: string): Promise<string> {
  const user = await getUser(agentId);
  if (user.providerPayeeId) return user.providerPayeeId;

  const provider = getPaymentProvider();
  const ref = await provider.registerPayee({ agentId, name: user.name, email: user.email, phone: user.phone });
  await db.collection('users').doc(agentId).set({ providerPayeeId: ref.providerPayeeId }, { merge: true });
  return ref.providerPayeeId;
}

/** Append-only money audit log. Never mutated. */
export async function appendPaymentEvent(
  bookingId: string,
  type: PaymentEventType,
  amount?: number,
  raw?: Record<string, unknown>,
): Promise<void> {
  await db.collection('payment_events').add({
    bookingId,
    type,
    amount: amount ?? null,
    raw: raw ?? null,
    at: now(),
  });
}
