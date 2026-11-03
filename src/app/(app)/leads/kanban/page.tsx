import Link from "next/link";
import { Columns3, List } from "lucide-react";
import { getSession } from "@/lib/auth";
import { applyLeadFilters, getLookups, LEAD_FILTER_KEYS, type LeadFilters } from "@/lib/data";
import { Card, PageHeader } from "@/components/ui";
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

  const columns = await Promise.all(
    lookups.stages.filter(stage => !filters.stage || stage.id === filters.stage).map(async (stage) => {
      const { data, count } = await applyLeadFilters(
        supabase
          .from("leads")
          .select(
            "id, student_name, mobile, lead_no, priority, attempt_count, total_calls, last_attempt_at, last_activity_at, last_activity_summary, other_fields, created_at, next_followup_at, owner:profiles!leads_owner_id_fkey(full_name), course:courses(name)",
            { count: "exact" },
          ),
        { ...filters, stage: stage.id },
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
    <>
      <PageHeader
        title="Your pipeline"
        description="See the journey. Move relationships forward, one stage at a time."
      >
        <div className="segmented">
            <Link href={viewHref("/leads", { ...filters, size: "50" })} className="flex items-center gap-2">
            <List size={14} />
            List
          </Link>
          <Link
            href="/leads/kanban"
            aria-current="page"
            className="flex items-center gap-2"
          >
            <Columns3 size={14} />
            Board
          </Link>
        </div>
      </PageHeader>
        <div className="mb-4">
          {profile.role !== "agent" && <CategorySwitcher current={{ ...filters }} path="/leads/kanban" />}
        </div>
      <DateFilter label="Lead dates" field />
      <Card className="mb-6 flex flex-wrap items-center gap-2 p-4">
        <LeadFilterBar lookups={lookups} current={{ ...filters }} isStaff={profile.role !== "agent"} isAdmin={profile.role === "admin"} />
      </Card>
      {columns.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          No stages are configured yet. An admin can add them in Configuration →
          Masters.
        </Card>
      ) : (
        <Kanban columns={columns} perColumn={PER_COLUMN} filters={{ ...filters }} stages={lookups.stages} />
      )}
    </>
  );
}
