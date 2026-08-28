import { getAuth } from 'firebase-admin/auth';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { db } from '../admin';
import { requireAuth } from './util';

const VALID_ROLES = ['donor', 'agent', 'recipient'] as const;

/**
 * Sets the caller's role as a custom auth claim — the claim the security rules
 * and every callable's requireRole() trust. This is what makes the role model
 * real: without it no one can pass an agent/recipient check.
 *
 * Self-serve for MVP signup, but locked to set-once: a user can't flip roles
 * later (e.g. to grab a payout mid-flow). Changing an existing role is an admin
 * action, out of scope here. The client must refresh its ID token
 * (getIdToken(true)) after this returns for the new claim to take effect.
 */
export const setRole = onCall(async (request) => {
  const uid = requireAuth(request);
  const role = request.data?.role as string | undefined;
  if (!role || !(VALID_ROLES as readonly string[]).includes(role)) {
    throw new HttpsError('invalid-argument', `role must be one of: ${VALID_ROLES.join(', ')}.`);
  }

  const existing = request.auth?.token?.role as string | undefined;
  if (existing && existing !== role) {
    throw new HttpsError('failed-precondition', 'Role already set; changing it requires an admin.');
  }
  if (existing === role) {
    return { role, alreadySet: true, refreshToken: false };
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), role });
  await db.collection('users').doc(uid).set({ role }, { merge: true });

  return { role, alreadySet: false, refreshToken: true };
});
