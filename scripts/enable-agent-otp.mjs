// Read-only readiness check by default. --activate --phone-provider-ready enables OTP-only access.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd());
const required = ['NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)}`);
if (!response.ok) throw new Error('Firebase project configuration could not be verified');
const config = await response.json();
if (!config.authorizedDomains?.includes('lead-crm-orpin-ten.vercel.app')) throw new Error('Authorize lead-crm-orpin-ten.vercel.app in Firebase first');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: agents, error } = await client.from('profiles').select('id,emp_code,phone').eq('role', 'agent').eq('is_active', true);
if (error) throw new Error(error.message);
const seen = new Set();
for (const agent of agents) {
  const result = await client.rpc('crm_phone_e164', { value: agent.phone });
  if (result.error || !result.data) throw new Error(`${agent.emp_code}: needs a valid registered mobile number`);
  if (seen.has(result.data)) throw new Error('Active agents share a mobile number. Assign unique numbers before activation.');
  seen.add(result.data);
}
for (const table of ['firebase_agent_sessions', 'firebase_otp_attempts']) {
  const result = await client.from(table).select('*', { head: true, count: 'exact' });
  if (result.error) throw new Error('Apply upgrade-006 before activation');
}
console.log(`Readiness checks passed for ${agents.length} active agents. Confirm Firebase Phone provider, India SMS delivery/billing and deployed web config before activation.`);
if (process.argv.includes('--activate')) {
  if (!process.argv.includes('--phone-provider-ready')) throw new Error('Confirm Phone provider and SMS setup with --phone-provider-ready');
  const { error } = await client.from('app_settings').update({ value: 'firebase', updated_at: new Date().toISOString() }).eq('key', 'agent_auth_mode');
  if (error) throw new Error(error.message);
  const { data, error: checkError } = await client.from('app_settings').select('value').eq('key', 'agent_auth_mode').single();
  if (checkError || data.value !== 'firebase') throw new Error('Activation could not be confirmed');
  console.log('Firebase SMS-only access enabled. Existing agent password sessions no longer have CRM access.');
}
