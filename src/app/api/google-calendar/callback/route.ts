import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { clearSigned, readSigned } from '@/lib/signed-cookie';
import { CALENDAR_SCOPE, GOOGLE_STATE_COOKIE, encryptGoogleToken, exchangeGoogleCode, googleAccountEmail } from '@/lib/google-calendar';

export async function GET(request: NextRequest) {
  const { profile } = await getSession();
  const saved = await readSigned<{ state: string; verifier: string; userId: string; leadId: string }>(GOOGLE_STATE_COOKIE);
  await clearSigned(GOOGLE_STATE_COOKIE);
  const valid = saved && saved.userId === profile.id && saved.state === request.nextUrl.searchParams.get('state') && /^[0-9a-f-]{36}$/i.test(saved.leadId);
  const destination = new URL(valid ? `/leads/${saved.leadId}` : '/leads', request.url);
  let result = 'error';
  if (valid && !request.nextUrl.searchParams.has('error')) {
    try {
      const code = request.nextUrl.searchParams.get('code');
      if (!code) throw new Error('Missing code');
      const tokens = await exchangeGoogleCode(code, saved.verifier);
      if (!tokens.access_token || !tokens.refresh_token || !tokens.scope?.split(' ').includes(CALENDAR_SCOPE)) throw new Error('Missing Calendar consent');
      const email = await googleAccountEmail(tokens.access_token);
      const { error } = await createAdminClient().from('google_calendar_accounts').upsert({
        user_id: profile.id, email, refresh_token_encrypted: encryptGoogleToken(tokens.refresh_token), connected_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw new Error('Could not save connection');
      result = 'connected';
    } catch { /* Keep provider errors, codes, and tokens out of URLs and logs. */ }
  }
  destination.searchParams.set('calendar', result);
  return NextResponse.redirect(destination);
}
