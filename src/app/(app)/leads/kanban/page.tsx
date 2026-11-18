import Link from "next/link";
import { Columns3, List } from "lucide-react";
import { getSession } from "@/lib/auth";
import { applyLeadFilters, getLookups, LEAD_FILTER_KEYS, type LeadFilters } from "@/lib/data";
import { Card } from "@/components/ui";
import { one, type SearchParams } from "@/lib/utils";
import { Kanban, type KanbanCard } from "./kanban";
import { CategorySwitcher } from "../category-switcher";
import { DateFilter } from "@/components/date-filter";
import { LeadFilterBar } from "../lead-filter-bar";
import { viewHref } from "@/lib/view-filters";

const PER_COLUMN = 40;

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();
  const lookups = await getLookups();
  const filters: LeadFilters = Object.fromEntries(LEAD_FILTER_KEYS.map(key => [key, one(sp[key])]));
  if (profile.role === "agent") delete filters.category;
  // Rechurned leads have their own tab in the list; the board shows the rest unless asked.
  const rechurned = filters.churn === "yes";
  const boardFilters: LeadFilters = { ...filters, churn: rechurned ? "yes" : "no" };

  const columns = await Promise.all(
    lookups.stages.filter(stage => !filters.stage || stage.id === filters.stage).map(async (stage) => {
      const { data, count } = await applyLeadFilters(
        supabase
          .from("leads")
          .select(
            "id, student_name, mobile, lead_no, priority, attempt_count, total_calls, last_attempt_at, last_activity_at, last_activity_summary, other_fields, created_at, next_followup_at, owner_id, sub_stage_id, remarks, owner:profiles!leads_owner_id_fkey(full_name), course:courses(name), sub_stage:sub_stages(name, color)",
            { count: "exact" },
          ),
        { ...boardFilters, stage: stage.id },
      )
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .limit(PER_COLUMN);
      const cards: KanbanCard[] = (
        (data ?? []) as unknown as Record<string, unknown>[]
      ).map((l) => ({
        id: l.id as string,
        name: l.student_name as string,
        mobile: l.mobile as string,
        leadNo: l.lead_no as string,
        priority: l.priority as string,
        attempts: l.attempt_count as number,
        calls: Number(l.total_calls ?? 0),
        lastAttempt: l.last_attempt_at as string | null,
        lastLog: l.last_activity_summary as string | null,
        lastLogAt: l.last_activity_at as string | null,
        createdAt: l.created_at as string,
        followup: l.next_followup_at as string | null,
        owner:
          (l.owner as { full_name: string } | null)?.full_name ?? "Unassigned",
        course: (l.other_fields as Record<string, string> | null)?.course_id || (l.course as { name: string } | null)?.name || "",
        overdue:
          !!l.next_followup_at &&
          new Date(l.next_followup_at as string) < new Date(),
        stageId: stage.id,
        subStageId: (l.sub_stage_id as string | null) ?? null,
        subStage: (l.other_fields as Record<string, string> | null)?.sub_stage_id || (l.sub_stage as { name: string } | null)?.name || "",
        subStageColor: (l.sub_stage as { color: string } | null)?.color ?? "#64748b",
        otherText: (l.other_fields as Record<string, string> | null)?.stage_id ?? "",
        remark: (l.remarks as string | null) ?? "",
        viewOnly: profile.role === "agent" && l.owner_id !== profile.id,
      }));
      return {
        id: stage.id,
        name: stage.name,
        color: stage.color,
        total: count ?? 0,
        cards,
      };
    }),
  );

  return (
    // On desktop the board fills the window; the lanes scroll inside it.
    <div className="-mt-3 flex flex-col gap-2 lg:-mt-5 lg:h-[calc(100dvh-76px-44px)] min-[1600px]:-mt-7 min-[1600px]:h-[calc(100dvh-76px-52px)]">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <h1 className="mr-1 text-xl font-semibold leading-tight">Pipeline</h1>
        <div className="segmented" role="tablist" aria-label="Lead groups">
          <Link href={viewHref("/leads/kanban", { ...filters, churn: undefined })} aria-current={rechurned ? undefined : "page"}>Leads</Link>
          <Link href={viewHref("/leads/kanban", { ...filters, churn: "yes" })} aria-current={rechurned ? "page" : undefined}>Rechurned</Link>
        </div>
        <div className="segmented">
          <Link href={viewHref("/leads", { ...filters, size: "50" })} className="flex items-center gap-1.5"><List size={14} /> List</Link>
          <Link href="/leads/kanban" aria-current="page" className="flex items-center gap-1.5"><Columns3 size={14} /> Board</Link>
        </div>
      </div>
      <Card className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        {profile.role !== "agent" && <>
          <CategorySwitcher current={{ ...filters }} path="/leads/kanban" compact />
          <span className="hidden h-6 w-px bg-line md:block" />
        </>}
        <DateFilter label="Dates" field className="mb-0 items-center border-0 bg-transparent p-0" />
        <span className="hidden h-6 w-px bg-line md:block" />
        <LeadFilterBar lookups={lookups} current={{ ...filters }} isStaff={profile.role !== "agent"} isAdmin={profile.role === "admin"} />
      </Card>
      {columns.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          No stages are configured yet. An admin can add them in Configuration →
          Masters.
        </Card>
      ) : (
        <Kanban columns={columns} perColumn={PER_COLUMN} filters={{ ...filters }} stages={lookups.stages.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          subStages={lookups.subStages.map((s) => ({ id: s.id, name: s.name, stage_id: s.stage_id }))} />
      )}
    </div>
  );
}
