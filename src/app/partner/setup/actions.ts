"use server";

import { createAdminClient, createStatelessClient } from "@/lib/supabase/server";

/**
 * Called from the emailed link. Opening the link proves the partner controls the mailbox,
 * so a successful password save also marks the email as verified.
 */
export async function finishPartnerSetup(accessToken: string, refreshToken: string, password: string) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: "Use 12–128 characters, including letters and numbers." };
  }
  if (typeof accessToken !== "string" || accessToken.length > 16000 || typeof refreshToken !== "string" || refreshToken.length > 2000) return { error: "Invalid link." };
  const client = createStatelessClient();
  const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error || !data.user) return { error: "This link has expired. Use “Forgot password” on the partner sign-in page for a new one." };
  try {
    const admin = createAdminClient();
    const { data: partner } = await admin.from("partners").select("id, email, is_active").eq("id", data.user.id).maybeSingle();
    if (!partner?.is_active) return { error: "This link is not for an active partner account." };
    if (data.user.email?.toLowerCase() !== partner.email.toLowerCase()) return { error: "This link was sent to a different email address. Ask the administrator for a new invitation." };
    const { error: updateError } = await client.auth.updateUser({ password });
    if (updateError) return { error: "Could not save the password. Request a new link and try again." };
    await admin.from("partners").update({ email_verified_at: new Date().toISOString() }).eq("id", partner.id).is("email_verified_at", null);
    return { success: true };
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}
