"use server";

import { redirect } from "next/navigation";
import { requireGlobalLogin, requireOtp } from "@/lib/env";
import { clearSigned, readSigned, setSigned } from "@/lib/signed-cookie";
import { createAdminClient, createClient, createStatelessClient } from "@/lib/supabase/server";

const GLOBAL = "crm_global";
const PENDING = "crm_otp";
const INVALID = "Invalid email or password";
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
  if (!userId || !password) return { error: "Enter email and password" };
  try {
    if (requireGlobalLogin() && !(await readSigned(GLOBAL))) return { error: "Global login expired. Please start again.", step: undefined };

    const email = userId.trim().toLowerCase();
    const admin = createAdminClient();
    const lookup = admin.from("profiles").select("email, full_name, is_active");
    // exact match only (both are stored in one case), so "%" or "_" cannot stand in for a user id
    const { data: profile } = await lookup.eq("email", email).maybeSingle();
    // Same message for "no such user" and "wrong password" so user ids cannot be probed.
    if (!profile) return { error: INVALID };
    if (!profile.is_active) return { error: "This account is deactivated. Contact your administrator." };

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
  if (!otpProfile?.is_active) return { error: "This account is inactive. Contact your administrator." };
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

export async function requestPasswordSetup(email: string): Promise<{ error?: string; message?: string }> {
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) return { error: "Enter your email address above first." };
  const message = "If this email belongs to an active account, a password setup link will arrive shortly. Check your inbox and spam folder.";
  const { data: profile, error } = await createAdminClient().from("profiles").select("is_active").eq("email", normalized).maybeSingle();
  if (error) return { error: "Could not request a setup link. Please try again." };
  if (profile?.is_active) {
    const origin = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://lead-crm-orpin-ten.vercel.app";
    const { error: sendError } = await createStatelessClient().auth.resetPasswordForEmail(normalized, { redirectTo: `${origin.replace(/\/$/, "")}/login/password-setup` });
    if (sendError) return { error: "Could not send the setup link. Please wait a little and try again, or ask an admin to reset your password." };
  }
  return { message };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  await clearSigned(GLOBAL, PENDING, PHONE_PENDING);
  redirect("/login");
}
