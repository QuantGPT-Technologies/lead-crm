"use server";

import { redirect } from "next/navigation";
import { requireGlobalLogin, requireOtp } from "@/lib/env";
import { clearSigned, readSigned, setSigned } from "@/lib/signed-cookie";
import { createAdminClient, createClient, createStatelessClient } from "@/lib/supabase/server";

const GLOBAL = "crm_global";
const PENDING = "crm_otp";
const INVALID = "Invalid user id or password";

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
    if (requireGlobalLogin() && !(await readSigned(GLOBAL))) return { error: "Global login expired. Please start again.", step: undefined };

    const id = userId.trim();
    const admin = createAdminClient();
    const lookup = admin.from("profiles").select("email, full_name, is_active");
    const { data: profile } = await (id.includes("@") ? lookup.ilike("email", id) : lookup.ilike("emp_code", id)).maybeSingle();
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
  const token = code.replace(/\s/g, "");
  if (!/^\d{6,8}$/.test(token)) return { error: "Enter the numeric OTP from your email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: pending.email, token, type: "email" });
  if (error) return { error: "Incorrect or expired OTP" };
  await clearSigned(GLOBAL, PENDING);
  return { step: "done" };
}

export async function resetLogin() {
  await clearSigned(GLOBAL, PENDING);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  await clearSigned(GLOBAL, PENDING);
  redirect("/login");
}
