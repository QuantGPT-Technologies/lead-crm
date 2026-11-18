import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";
import { readTabSession } from "@/lib/tab-session";

/** Signed-in user + profile for the current request. Redirects to /login when there is none. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  // getClaims verifies the token locally when the project uses asymmetric signing keys
  // (otherwise it asks Supabase Auth, like getUser), saving a round trip on every request.
  const { data: claimData } = await supabase.auth.getClaims();
  const userId = claimData?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !(await readTabSession(userId, session.access_token))) redirect("/login?fresh=1");

  // Signed-in users can only read colleagues' names and roles from `profiles`; the full row
  // (email, phone) of the verified user is read with the service role. Both reads run together.
  const admin = createAdminClient();
  const [{ data: profile }, { data: partner }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("partners").select("id").eq("id", userId).maybeSingle(),
  ]);
  // Partners have their own portal and never see the staff workspace.
  if (!profile && partner) redirect("/partner");
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
