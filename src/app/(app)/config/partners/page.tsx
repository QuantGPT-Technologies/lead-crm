import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import type { Partner } from "@/lib/types";
import { PartnersTable } from "./partners-table";

export default async function PartnersPage() {
  await requireRole("admin");
  const admin = createAdminClient();
  const { data } = await admin.from("partners").select("*").order("created_at", { ascending: false });
  const partners = (data ?? []) as Partner[];
  const counts = await Promise.all(
    partners.map((p) => admin.from("leads").select("id", { count: "exact", head: true }).eq("partner_id", p.id).then((r) => [p.id, r.count ?? 0] as const)),
  );
  return (
    <>
      <PageHeader title="Partners" description="Partners submit leads through their own portal and follow each lead's progress." />
      <PartnersTable partners={partners} leadCounts={Object.fromEntries(counts)} />
    </>
  );
}
