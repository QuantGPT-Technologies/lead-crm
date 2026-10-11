import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

/** Signed-in user + profile for the current request. Redirects to /login when there is none. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Signed-in users can only read colleagues' names and roles from `profiles`; the full row
  // (email, phone) of the verified user is read with the service role.
  const { data: profile } = await createAdminClient().from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login?error=inactive");
  }
  return { supabase, profile: profile as Profile };
});

/** For pages: bounce users without the role back to the dashboard. */
export async function requireRole(...roles: Role[]) {
  const session = await getSession();
  if (!roles.includes(session.profile.role)) redirect("/dashboard?denied=1");
  return session;
}

export const isStaff = (role: Role) => role === "admin" || role === "manager";
