"use server";

import { redirect } from "next/navigation";
import { requireGlobalLogin, requireOtp } from "@/lib/env";
import { clearSigned, readSigned, setSigned } from "@/lib/signed-cookie";
import { createAdminClient, createClient, createStatelessClient } from "@/lib/supabase/server";
import { agentFirebaseRequired, supabaseSessionId } from "@/lib/agent-auth";
import { verifyFirebasePhoneToken, firebasePhoneServerConfigured } from "@/lib/firebase-admin";
import { toE164Phone } from "@/lib/phone";

const GLOBAL = "crm_global";
const PENDING = "crm_otp";
const INVALID = "Invalid user id or password";
const PHONE_PENDING = "crm_phone_challenge";

type StepResult = { error?: string; step?: "user" | "otp" | "done"; name?: string };

export async function globalLogin(email: string, password: string): Promise<StepResult> {
  if (!email || !password) return { error: "Enter email and password" };
  try {
    const { data, error } = await createAdminClient().rpc("verify_global_login", { p_email: email, p_password: password });
    if (error) return { error: `Server is not set up yet: ${error.message}` };
    if (!data) return { error: "Invalid global email or password" };
    await setSigned(GLOBAL, { ok: true }, 60 * 60 * 12);
    return { step: "user" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Login failed" };
  }
}

export async function userLogin(userId: string, password: string): Promise<StepResult> {
  if (!userId || !password) return { error: "Enter user id and password" };
  try {
    if (requireGlobalLogin() && !(await agentFirebaseRequired()) && !(await readSigned(GLOBAL))) return { error: "Global login expired. Please start again.", step: undefined };

    const id = userId.trim();
    const admin = createAdminClient();
    const lookup = admin.from("profiles").select("email, full_name, is_active, role");
    // exact match only (both are stored in one case), so "%" or "_" cannot stand in for a user id
    const { data: profile } = await (id.includes("@") ? lookup.eq("email", id.toLowerCase()) : lookup.eq("emp_code", id.toUpperCase())).maybeSingle();
    // Same message for "no such user" and "wrong password" so user ids cannot be probed.
    if (!profile) return { error: INVALID };
    if (!profile.is_active) return { error: "This account is deactivated. Contact your administrator." };
    if (profile.role === "agent" && await agentFirebaseRequired()) return { error: "Sales agents must use mobile OTP sign-in." };

    if (!requireOtp()) {
      const supabase = await createClient();
      const { error } = await supabase.auth.signInWithPassword({ email: profile.email, password });
      if (error) return { error: INVALID };
      await clearSigned(GLOBAL);
      return { step: "done" };
    }

    // OTP flow: check the password without creating a browser session, then email a code.
    const stateless = createStatelessClient();
    const { error } = await stateless.auth.signInWithPassword({ email: profile.email, password });
    if (error) return { error: INVALID };
    await stateless.auth.signOut({ scope: "local" });

    const { error: otpError } = await stateless.auth.signInWithOtp({ email: profile.email, options: { shouldCreateUser: false } });
    if (otpError) return { error: `Could not send OTP: ${otpError.message}` };
    await setSigned(PENDING, { email: profile.email, name: profile.full_name }, 60 * 10);
    return { step: "otp", name: profile.full_name };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Login failed" };
  }
}

export async function verifyOtp(code: string): Promise<StepResult> {
  const pending = await readSigned<{ email: string }>(PENDING);
  if (!pending) return { error: "OTP expired. Please sign in again." };
  const { data: otpProfile } = await createAdminClient().from("profiles").select("role,is_active").eq("email", pending.email).maybeSingle();
  if (!otpProfile?.is_active || (otpProfile.role === "agent" && await agentFirebaseRequired())) return { error: "Use mobile OTP sign-in for this account." };
  const token = code.replace(/\s/g, "");
  if (!/^\d{6,8}$/.test(token)) return { error: "Enter the numeric OTP from your email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: pending.email, token, type: "email" });
  if (error) return { error: "Incorrect or expired OTP" };
  await clearSigned(GLOBAL, PENDING);
  return { step: "done" };
}

export async function resetLogin() {
  await clearSigned(GLOBAL, PENDING, PHONE_PENDING);
}

export async function signOut() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  const sessionId = user && session ? supabaseSessionId(session.access_token, user.id) : null;
  if (sessionId && user) await createAdminClient().from("firebase_agent_sessions").delete().eq("session_id",sessionId).eq("user_id",user.id);
  await supabase.auth.signOut({ scope: "local" });
  await clearSigned(GLOBAL, PENDING, PHONE_PENDING);
  redirect("/login");
}

export async function firebaseAgentLogin(idToken: string): Promise<StepResult> {
  const invalid = "Could not sign in. Use the registered mobile number and request a fresh OTP.";
  if (!firebasePhoneServerConfigured() || !(await agentFirebaseRequired())) return { error: "SMS sign-in is not enabled yet. Contact your administrator." };
  if (typeof idToken !== "string" || idToken.length > 12000) return { error: invalid };
  const admin = createAdminClient();
  const stateless = createStatelessClient();
  let sessionId: string | null = null;
  let userId: string | null = null;
  try {
    const token = await verifyFirebasePhoneToken(idToken);
    const now = Math.floor(Date.now()/1000);
    if (token.firebase?.sign_in_provider !== "phone" || !token.phone_number || !Number.isInteger(token.auth_time)
      || token.auth_time > now + 30 || token.auth_time < now - 300) return { error: invalid };
    const phone = toE164Phone(token.phone_number);
    const pending = await readSigned<{ phone: string }>(PHONE_PENDING);
    if (!phone || pending?.phone !== phone) return { error: invalid };
    const { data: profiles, error: profileError } = await admin.rpc("agent_login_profile", { p_phone: phone });
    if (profileError || !profiles || profiles.length !== 1) return { error: invalid };
    const profile = profiles[0] as { id: string; email: string; phone: string };
    const { data: identity, error: identityError } = await admin.auth.admin.getUserById(profile.id);
    if (identityError || identity.user.email?.toLowerCase() !== profile.email.toLowerCase()) return { error: invalid };
    const { error: consumed } = await admin.from("firebase_otp_attempts").insert({ firebase_uid: token.uid, firebase_auth_time: token.auth_time, user_id: profile.id });
    if (consumed) return { error: invalid };
    // generateLink does not send email. Firebase has already proved phone ownership.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: profile.email });
    if (linkError || link.user.id !== profile.id) throw new Error("Session creation failed");
    const { data: verified, error: verifyError } = await stateless.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
    if (verifyError || !verified.session || verified.user?.id !== profile.id) throw new Error("Session creation failed");
    userId = profile.id;
    sessionId = supabaseSessionId(verified.session.access_token, profile.id);
    if (!sessionId) throw new Error("Invalid session");
    const { error: proofError } = await admin.from("firebase_agent_sessions").insert({ session_id: sessionId, user_id: profile.id,
      firebase_uid: token.uid, phone_e164: phone, firebase_auth_time: new Date(token.auth_time*1000).toISOString(),
      expires_at: new Date(Date.now()+12*60*60*1000).toISOString() });
    if (proofError) throw new Error("Session verification failed");
    const supabase = await createClient();
    const { error: setError } = await supabase.auth.setSession({ access_token: verified.session.access_token, refresh_token: verified.session.refresh_token });
    if (setError) throw new Error("Could not start session");
    await clearSigned(GLOBAL,PENDING,PHONE_PENDING);
    return { step: "done" };
  } catch {
    if (sessionId && userId) await admin.from("firebase_agent_sessions").delete().eq("session_id",sessionId).eq("user_id",userId);
    await stateless.auth.signOut({ scope: "local" }).catch(() => {});
    return { error: invalid };
  }
}

export async function beginAgentOtp(rawPhone: string): Promise<{ error?: string; phone?: string }> {
  if (!firebasePhoneServerConfigured() || !(await agentFirebaseRequired())) return { error: "SMS sign-in is not enabled yet. Contact your administrator." };
  const phone = typeof rawPhone === "string" ? toE164Phone(rawPhone) : null;
  if (!phone) return { error: "Enter your registered mobile number, including country code outside India." };
  const { data, error } = await createAdminClient().rpc("agent_login_profile",{ p_phone: phone });
  if (error || !data || data.length !== 1) return { error: "This mobile number is not available for sign-in. Contact your administrator." };
  await setSigned(PHONE_PENDING,{ phone },300);
  return { phone };
}
