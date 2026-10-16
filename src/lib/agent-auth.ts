import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/server';

export const agentFirebaseRequired = cache(async () => {
  const { data, error } = await createAdminClient().from('app_settings').select('value').eq('key','agent_auth_mode').maybeSingle();
  if (error) throw new Error('Could not check sign-in policy. Please try again.');
  return data?.value === 'firebase';
});

/** Decode only after Supabase has validated the bearer/session with getUser or verifyOtp. */
export function supabaseSessionId(token: string, userId: string) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return claims.sub === userId && typeof claims.session_id === 'string' && claims.session_id.length <= 200 ? claims.session_id as string : null;
  } catch { return null; }
}
