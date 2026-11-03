import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, AlarmClockOff, Columns3, List, Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  applyLeadFilters,
  getLookups,
  getSetting,
  LEAD_FILTER_KEYS,
  type LeadFilters,
} from "@/lib/data";
import { Card, PageHeader, Pager, btn } from "@/components/ui";
import {
  cn,
  fmtDate,
  fmtDateTime,
  maskEmail,
  maskMobile,
  one,
  type SearchParams,
} from "@/lib/utils";
import { LeadFilterBar } from "./lead-filter-bar";
import { LeadTable, type LeadRow } from "./lead-table";
import { CategorySwitcher } from "./category-switcher";
import { DateFilter } from "@/components/date-filter";
import { LEAD_SORTS, viewHref } from "@/lib/view-filters";

const SORTS = LEAD_SORTS;
const SIZES = [25, 50, 100];

const LIST_COLUMNS =
    "id, lead_no, student_name, mobile, email, product, city, priority, category, attempt_count, total_calls, last_attempt_at, other_fields, next_followup_at, created_at, " +
  "source:lead_sources(name), university:universities(name), course:courses(name), stage:stages(name, color), " +
  "sub_stage:sub_stages(name,color), owner:profiles!leads_owner_id_fkey(full_name)";

type Rel = { name?: string; color?: string; full_name?: string } | null;

export default async function LeadListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();

  const filters: LeadFilters = Object.fromEntries(
    LEAD_FILTER_KEYS.map((k) => [k, one(sp[k])]),
  );
  const assigning = profile.role !== "agent" && filters.owner === "none";
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const size = SIZES.includes(Number(one(sp.size))) ? Number(one(sp.size)) : 50;
  const sort = SORTS.includes(one(sp.sort) ?? "")
    ? one(sp.sort)!
    : "created_at";
  const asc = one(sp.dir) === "asc";

  const query = applyLeadFilters(
    supabase.from("leads").select(LIST_COLUMNS, { count: "exact" }),
    filters,
  )
    .order(sort, { ascending: asc, nullsFirst: false })
    .order("id", { ascending: asc })
    .range((page - 1) * size, page * size - 1);
  const [{ data, count, error }, maskSetting, lookups] = await Promise.all([
    query,
    getSetting(supabase, "mask_contacts_in_list", true),
    getLookups(),
  ]);

  // A page number past the end (stale bookmark, or rows removed by a filter/delete) makes
  // PostgREST reject the range; send the user to the first page instead of showing an error.
  if (error?.code === "PGRST103" && page > 1) {
    const sp1 = new URLSearchParams();
    Object.entries({
      ...filters,
      size: String(size),
      sort,
      dir: asc ? "asc" : "desc",
    }).forEach(([k, v]) => v && sp1.set(k, v));
    redirect(`/leads?${sp1}`);
  }

  const masked = maskSetting && profile.role !== "admin";
  const rows: LeadRow[] = (
    (data ?? []) as unknown as Record<string, unknown>[]
  ).map((l) => ({
    id: l.id as string,
    lead_no: l.lead_no as string,
    name: l.student_name as string,
    mobile: masked ? maskMobile(l.mobile as string) : (l.mobile as string),
    email: masked
      ? maskEmail(l.email as string | null)
      : ((l.email as string | null) ?? ""),
    university: (l.other_fields as Record<string, string> | null)?.university_id || (l.university as Rel)?.name || "",
    course: (l.other_fields as Record<string, string> | null)?.course_id || (l.course as Rel)?.name || "",
    stage: (l.other_fields as Record<string, string> | null)?.stage_id || (l.stage as Rel)?.name || "",
    stageColor: (l.stage as Rel)?.color ?? "#64748b",
    subStage: (l.other_fields as Record<string, string> | null)?.sub_stage_id || (l.sub_stage as Rel)?.name || "",
    subStageColor: (l.sub_stage as Rel)?.color ?? "#64748b",
    source: (l.other_fields as Record<string, string> | null)?.source_id || (l.source as Rel)?.name || "",
    owner: (l.owner as Rel)?.full_name ?? "Unassigned",
    product: (l.product as string | null) ?? "",
    city: (l.city as string | null) ?? "",
    priority: l.priority as string,
    priorityDescription: (l.other_fields as Record<string, string> | null)?.priority,
      category: (l.category as string | null) ?? "Uncategorized",
    attempts: l.attempt_count as number,
    calls: Number(l.total_calls ?? 0),
    lastAttempt: fmtDateTime(l.last_attempt_at as string | null),
    followup: fmtDateTime(l.next_followup_at as string | null),
    overdue:
      !!l.next_followup_at &&
      new Date(l.next_followup_at as string) < new Date(),
    created: fmtDate(l.created_at as string),
  }));

  const params: Record<string, string | undefined> = {
    ...filters,
    size: String(size),
    sort,
    dir: asc ? "asc" : "desc",
  };
  const assignmentParams = new URLSearchParams();
  Object.entries({ ...params, owner: assigning ? "" : "none" }).forEach(
    ([key, value]) => value && assignmentParams.set(key, value),
  );
  const followupHref = (v: "today" | "missed") => {
    // toggles this one filter and keeps every other filter, the sort and the page size
    const s = new URLSearchParams();
    Object.entries({
      ...params,
      followup: filters.followup === v ? undefined : v,
    }).forEach(([k, val]) => val && s.set(k, val));
    return `/leads?${s}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={assigning ? "Assign unassigned leads" : "Your leads"}
        description={assigning ? "Only leads without an owner are shown. Assigned leads leave this list automatically." : "Real people. New possibilities. Keep every relationship moving."}
      >
        <div className="segmented">
          <Link
            href="/leads"
            aria-current="page"
            className="flex items-center gap-2"
          >
            <List size={14} />
            List
          </Link>
            <Link href={viewHref("/leads/kanban", params)} className="flex items-center gap-2">
            <Columns3 size={14} />
            Board
          </Link>
        </div>
        {profile.role !== "agent" && (
          <Link
            href={`/leads?${assignmentParams}`}
            className={btn("outline")}
          >
            {assigning ? "View all leads" : "Bulk assign"}
          </Link>
        )}
        <Link href="/leads/new" className={btn()}>
          <Plus size={15} />
          New lead
        </Link>
      </PageHeader>
        <CategorySwitcher current={params} />
        <DateFilter label="Lead dates" field />
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <LeadFilterBar
          lookups={lookups}
          current={params}
          isStaff={profile.role !== "agent"}
          isAdmin={profile.role === "admin"}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <Link
            href={followupHref("today")}
            className={cn(
              btn(filters.followup === "today" ? "success" : "outline"),
              filters.followup !== "today" &&
                "!border-emerald-600 !text-emerald-600",
            )}
          >
            <AlarmClock size={15} /> Due today
          </Link>
          <Link
            href={followupHref("missed")}
            className={cn(
              btn("danger"),
              filters.followup === "missed" && "!bg-red-600 !text-white",
            )}
          >
            <AlarmClockOff size={15} /> Overdue
          </Link>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {error ? (
          <p className="p-6 text-red-600">
            Could not load leads: {error.message}
          </p>
        ) : (
          <LeadTable
            rows={rows}
            params={params}
            role={profile.role}
            stages={lookups.stages.map((s) => ({ value: s.id, label: s.name }))}
            users={lookups.users.map((u) => ({
              value: u.id,
              label: `${u.full_name} (${u.emp_code})`,
            }))}
          />
        )}
        <Pager
          page={page}
          size={size}
          total={count ?? 0}
          params={params}
          path="/leads"
        />
      </Card>
    </div>
  );
}
