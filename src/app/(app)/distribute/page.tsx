import { requireRole } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { one, type SearchParams } from "@/lib/utils";
import { DistributeForm } from "./distribute-form";

export default async function DistributePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin", "manager");
  const lookups = await getLookups();

  const pool = supabase.from("leads").select("id", { count: "exact", head: true }).is("owner_id", null);
  const [{ count: unassigned }, { data: batches }, { data: summary }] = await Promise.all([
    pool,
    supabase.from("upload_batches").select("id, file_name, inserted_rows, created_at").order("created_at", { ascending: false }).limit(30),
    supabase.rpc("allotment_summary"),
  ]);
  const load = Object.fromEntries(((summary ?? []) as { agent_id: string; total: number }[]).map((r) => [r.agent_id, Number(r.total)]));

  return (
    <>
      <PageHeader title="Distribute Leads" />
      <DistributeForm
        unassigned={unassigned ?? 0}
        users={lookups.users.map((u) => ({ id: u.id, name: u.full_name, code: u.emp_code, role: u.role, load: load[u.id] ?? 0 }))}
        sources={lookups.sources}
        stages={lookups.stages}
        batches={(batches ?? []).map((b) => ({ id: b.id, name: `${b.file_name} (${b.inserted_rows})` }))}
        initialBatch={one(sp.batch) ?? ""}
      />
    </>
  );
}
