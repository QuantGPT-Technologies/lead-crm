// Explicit production provisioning. Does not print passwords, setup links or tokens.
// Default: create/promote the two requested admins and deactivate the confirmed test accounts.
// --send-setup: send password setup emails after the app is deployed.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (new URL(url).hostname !== 'nvnfptxqckaeatvaupau.supabase.co') throw new Error('Expected production database');
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const check = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const admins = [['director@successmentorix.com', 'Director'], ['founder@successmentorix.com', 'Founder']];
if (process.argv.includes('--send-setup')) {
  const destination = 'https://lead-crm-orpin-ten.vercel.app/login/password-setup';
  const response = await fetch(destination);
  if (!response.ok) throw new Error('Password setup page is not deployed');
  for (const [email] of admins) {
    const profile = check(await admin.from('profiles').select('id,role,is_active').eq('email', email).single());
    if (profile.role !== 'admin' || !profile.is_active) throw new Error('Admin profile is not ready');
    const result = await publicClient.auth.resetPasswordForEmail(email, { redirectTo: destination });
    if (result.error) { console.error(`${email}: setup email failed: ${result.error.message}`); process.exitCode = 1; }
    else console.log(`${email}: password setup email accepted by Supabase`);
  }
} else {
  let identities = [];
  for (let page = 1; ; page++) {
    const { users } = check(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
    identities.push(...users); if (users.length < 1000) break;
  }
  for (const [email, full_name] of admins) {
    let identity = identities.find(user => user.email?.toLowerCase() === email);
    let created = false;
    if (!identity) { identity = check(await admin.auth.admin.createUser({ email, password: randomBytes(40).toString('base64url'), email_confirm: true })).user; created = true; }
    const existing = check(await admin.from('profiles').select('id').eq('id', identity.id).maybeSingle());
    const row = { full_name, email, role: 'admin', is_active: true };
    const result = existing ? await admin.from('profiles').update(row).eq('id', identity.id) : await admin.from('profiles').insert({ id: identity.id, ...row });
    if (result.error) { if (created) await admin.auth.admin.deleteUser(identity.id); throw new Error(result.error.message); }
    check(await admin.auth.admin.updateUserById(identity.id, { ban_duration: 'none' }));
    console.log(`${email}: active admin ready`);
  }
  const emails = ['zztest-a1@example.com', 'zztest-a2@example.com', 'zztest-a3@example.com'];
  const profiles = check(await admin.from('profiles').select('*').in('email', emails));
  mkdirSync('.migration', { recursive: true });
  writeFileSync(`.migration/deactivated-test-agents-${Date.now()}.json`, JSON.stringify(profiles, null, 2));
  for (const profile of profiles) {
    check(await admin.from('profiles').update({ is_active: false }).eq('id', profile.id));
    check(await admin.auth.admin.updateUserById(profile.id, { ban_duration: '876000h' }));
    console.log(`${profile.email}: deactivated`);
  }
}
