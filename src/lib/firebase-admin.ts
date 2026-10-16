import 'server-only';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'), { timeoutDuration: 10000 });

export const firebasePhoneServerConfigured = () => !!(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

/** Public-certificate verification plus a live end-user lookup; no service-account key required. */
export async function verifyFirebasePhoneToken(idToken: string) {
  // Never accept emulator tokens on this production authentication path.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Emulator authentication is not supported');
  if (!firebasePhoneServerConfigured()) throw new Error('Firebase is not configured');
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
  const { payload } = await jwtVerify(idToken, googleKeys, {
    algorithms: ['RS256'], audience: project, issuer: `https://securetoken.google.com/${project}`,
    requiredClaims: ['exp', 'iat', 'sub', 'auth_time'], maxTokenAge: '1h',
  });
  if (!payload.sub || payload.sub.length > 128 || typeof payload.auth_time !== 'number'
    || !Number.isInteger(payload.auth_time) || payload.auth_time > Math.floor(Date.now()/1000)
    || typeof payload.phone_number !== 'string' || !payload.firebase || typeof payload.firebase !== 'object'
    || (payload.firebase as { sign_in_provider?: string }).sign_in_provider !== 'phone') throw new Error('Invalid phone authentication');
  const token = { uid: payload.sub, phone_number: payload.phone_number, auth_time: payload.auth_time,
    firebase: { sign_in_provider: 'phone' } };
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY!)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
    cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Firebase account verification failed');
  const result = await response.json() as { users?: { localId?: string; phoneNumber?: string; disabled?: boolean; validSince?: string }[] };
  const user = result.users?.length === 1 ? result.users[0] : null;
  if (!user || user.localId !== token.uid || user.phoneNumber !== token.phone_number || user.disabled
    || (user.validSince && (!Number.isFinite(Number(user.validSince)) || token.auth_time < Number(user.validSince)))) {
    throw new Error('Firebase account is invalid or revoked');
  }
  return token;
}
