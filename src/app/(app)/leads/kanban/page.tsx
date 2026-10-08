import Link from "next/link";
import { getSession } from "@/lib/auth";
import { applyLeadFilters, getLookups, type LeadFilters } from "@/lib/data";
import { Card, PageHeader, Select, btn } from "@/components/ui";
import { one, type SearchParams } from "@/lib/utils";
import { Kanban, type KanbanCard } from "./kanban";

const PER_COLUMN = 40;

export default async function KanbanPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();
  const lookups = await getLookups();
  const filters: LeadFilters = { q: one(sp.q), source: one(sp.source), owner: one(sp.owner) };

  const columns = await Promise.all(
    lookups.stages.map(async (stage) => {
      const { data, count } = await applyLeadFilters(
        supabase.from("leads").select("id, student_name, lead_no, priority, attempt_count, next_followup_at, owner:profiles!leads_owner_id_fkey(full_name), course:courses(name)", { count: "exact" }),
        { ...filters, stage: stage.id },
      )
        .order("updated_at", { ascending: false })
        .limit(PER_COLUMN);
      const cards: KanbanCard[] = ((data ?? []) as unknown as Record<string, unknown>[]).map((l) => ({
        id: l.id as string,
        name: l.student_name as string,
        leadNo: l.lead_no as string,
        priority: l.priority as string,
        attempts: l.attempt_count as number,
        owner: (l.owner as { full_name: string } | null)?.full_name ?? "Unassigned",
        course: (l.course as { name: string } | null)?.name ?? "",
        overdue: !!l.next_followup_at && new Date(l.next_followup_at as string) < new Date(),
      }));
      return { id: stage.id, name: stage.name, color: stage.color, total: count ?? 0, cards };
    }),
  );

  return (
    <>
      <PageHeader title="Lead Kanban">
        <form className="flex flex-wrap items-center gap-2">
          <input name="q" defaultValue={filters.q} placeholder="Search name / mobile" aria-label="Search" className="input !h-9 !w-48" />
          <Select name="source" defaultValue={filters.source ?? ""} options={lookups.sources.map((s) => ({ value: s.id, label: s.name }))} placeholder="All sources" className="!h-9 !w-40" />
          {profile.role !== "agent" && (
            <Select name="owner" defaultValue={filters.owner ?? ""} options={[{ value: "none", label: "Unassigned" }, ...lookups.users.map((u) => ({ value: u.id, label: u.full_name }))]} placeholder="All owners" className="!h-9 !w-44" />
          )}
          <button type="submit" className={btn("outline")}>
            Filter
          </button>
          <Link href="/leads/new" className={btn()}>
            Add
          </Link>
        </form>
      </PageHeader>
      {columns.length === 0 ? (
        <Card className="p-8 text-center text-muted">No stages are configured yet. An admin can add them in Configuration → Masters.</Card>
      ) : (
        <Kanban columns={columns} perColumn={PER_COLUMN} />
      )}
    </>
  );
}
