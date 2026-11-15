import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { readTabSession } from "@/lib/tab-session";
import type { Partner } from "@/lib/types";

/** Signed-in, verified partner for the current request. Staff are sent to their own workspace. */
export const getPartnerSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/partner/login");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !(await readTabSession(user.id, session.access_token))) redirect("/partner/login?fresh=1");

  const admin = createAdminClient();
  const { data: partner } = await admin.from("partners").select("*").eq("id", user.id).maybeSingle();
  if (!partner) {
    const { data: staff } = await admin.from("profiles").select("id").eq("id", user.id).maybeSingle();
    if (staff) redirect("/dashboard");
    await supabase.auth.signOut({ scope: "local" });
    redirect("/partner/login");
  }
  if (!partner.is_active || !partner.email_verified_at) {
    await supabase.auth.signOut({ scope: "local" });
    redirect(`/partner/login?error=${partner.is_active ? "unverified" : "inactive"}`);
  }
  return { partner: partner as Partner, admin };
});

export const partnerLabel = (p: Pick<Partner, "full_name" | "organization">) =>
  p.organization ? `${p.full_name} (${p.organization})` : p.full_name;
