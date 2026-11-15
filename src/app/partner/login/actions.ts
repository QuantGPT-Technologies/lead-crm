"use server";

import { redirect } from "next/navigation";
import { clearSigned } from "@/lib/signed-cookie";
import { createAdminClient, createClient, createStatelessClient } from "@/lib/supabase/server";
import { sendPartnerSetupEmail } from "@/lib/partner-email";
import { startTabSession } from "@/lib/tab-session";
import { TAB_COOKIE } from "@/lib/tab-session-constants";
import { isValidEmail } from "@/lib/utils";

const INVALID = "Invalid email or password";

/** Email and password sign-in. The mobile number is stored for contact only and is not verified. */
export async function partnerSignIn(emailInput: string, password: string): Promise<{ error?: string; tabKey?: string }> {
  const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
  if (!isValidEmail(email) || typeof password !== "string" || !password) return { error: "Enter email and password" };
  const admin = createAdminClient();
  const { data: partner } = await admin.from("partners").select("id, email, is_active, email_verified_at").eq("email", email).maybeSingle();
  if (!partner) return { error: INVALID };

  // Check the password without a session first, so a blocked account never gets cookies.
  const stateless = createStatelessClient();
  const { error: checkError } = await stateless.auth.signInWithPassword({ email: partner.email, password });
  if (checkError) return { error: INVALID };
  await stateless.auth.signOut({ scope: "local" });
  if (!partner.is_active) return { error: "This partner account is deactivated. Contact the administrator." };
  if (!partner.email_verified_at) return { error: "Verify your email first: open the link in the invitation email and set your password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: partner.email, password });
  if (error || !data.session || data.user.id !== partner.id) return { error: "Could not start your session. Please try again." };
  await admin.from("partners").update({ last_login_at: new Date().toISOString() }).eq("id", partner.id);
  const tabKey = await startTabSession(data.user.id, data.session.access_token);
  return { tabKey };
}

/** Sends a fresh link that verifies the email and lets the partner choose a new password. */
export async function partnerPasswordHelp(emailInput: string): Promise<{ error?: string; message?: string }> {
  const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
  if (!isValidEmail(email)) return { error: "Enter your email address above first." };
  const message = "If this email belongs to an active partner account, a link will arrive shortly. Check your inbox and spam folder.";
  const { data: partner } = await createAdminClient().from("partners").select("is_active").eq("email", email).maybeSingle();
  if (partner?.is_active) {
    const failed = await sendPartnerSetupEmail(email);
    if (failed) return { error: "Could not send the link. Please wait a little and try again." };
  }
  return { message };
}

export async function partnerSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  await clearSigned(TAB_COOKIE);
  redirect("/partner/login");
}
