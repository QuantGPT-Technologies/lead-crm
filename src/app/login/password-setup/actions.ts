"use server";

import { createAdminClient, createStatelessClient } from "@/lib/supabase/server";

export async function finishPasswordSetup(accessToken: string, refreshToken: string, password: string) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { error: "Use 12–128 characters, including letters and numbers." };
  }
  if (typeof accessToken !== "string" || accessToken.length > 16000 || typeof refreshToken !== "string" || refreshToken.length > 2000) return { error: "Invalid setup link." };
  const client = createStatelessClient();
  const { data, error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error || !data.user) return { error: "This link has expired. Ask your administrator for a new password-setup email." };
  try {
    const { data: profile } = await createAdminClient().from("profiles").select("role,is_active").eq("id", data.user.id).maybeSingle();
    if (!profile?.is_active || !["admin", "manager"].includes(profile.role)) return { error: "This account cannot use password setup." };
    const { error: updateError } = await client.auth.updateUser({ password });
    return updateError ? { error: "Could not save the password. Please request a fresh setup email and try again." } : { success: true };
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}
