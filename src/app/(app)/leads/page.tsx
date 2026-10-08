import Link from "next/link";
import { AlarmClock, AlarmClockOff } from "lucide-react";
import { getSession } from "@/lib/auth";
import { applyLeadFilters, getLookups, getSetting, LEAD_FILTER_KEYS, type LeadFilters } from "@/lib/data";
import { Card, Pager, btn } from "@/components/ui";
import { cn, fmtDate, fmtDateTime, maskEmail, maskMobile, one, type SearchParams } from "@/lib/utils";
import { LeadFilterBar } from "./lead-filter-bar";
import { LeadTable, type LeadRow } from "./lead-table";

const SORTS = ["created_at", "student_name", "attempt_count", "next_followup_at", "lead_no"];
const SIZES = [25, 50, 100];

const LIST_COLUMNS =
  "id, lead_no, student_name, mobile, email, product, city, priority, attempt_count, next_followup_at, created_at, " +
  "source:lead_sources(name), university:universities(name), course:courses(name), stage:stages(name, color), " +
  "sub_stage:sub_stages(name), owner:profiles!leads_owner_id_fkey(full_name)";

type Rel = { name?: string; color?: string; full_name?: string } | null;

export default async function LeadListPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();
  const lookups = await getLookups();

  const filters: LeadFilters = Object.fromEntries(LEAD_FILTER_KEYS.map((k) => [k, one(sp[k])]));
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const size = SIZES.includes(Number(one(sp.size))) ? Number(one(sp.size)) : 50;
  const sort = SORTS.includes(one(sp.sort) ?? "") ? one(sp.sort)! : "created_at";
  const asc = one(sp.dir) === "asc";

  const query = applyLeadFilters(supabase.from("leads").select(LIST_COLUMNS, { count: "exact" }), filters)
    .order(sort, { ascending: asc, nullsFirst: false })
    .range((page - 1) * size, page * size - 1);
  const [{ data, count, error }, maskSetting] = await Promise.all([query, getSetting(supabase, "mask_contacts_in_list", true)]);

  const masked = maskSetting && profile.role !== "admin";
  const rows: LeadRow[] = ((data ?? []) as unknown as Record<string, unknown>[]).map((l) => ({
    id: l.id as string,
    lead_no: l.lead_no as string,
    name: l.student_name as string,
    mobile: masked ? maskMobile(l.mobile as string) : (l.mobile as string),
    email: masked ? maskEmail(l.email as string | null) : ((l.email as string | null) ?? ""),
    university: (l.university as Rel)?.name ?? "",
    course: (l.course as Rel)?.name ?? "",
    stage: (l.stage as Rel)?.name ?? "",
    stageColor: (l.stage as Rel)?.color ?? "#64748b",
    subStage: (l.sub_stage as Rel)?.name ?? "",
    source: (l.source as Rel)?.name ?? "",
    owner: (l.owner as Rel)?.full_name ?? "Unassigned",
    product: (l.product as string | null) ?? "",
    city: (l.city as string | null) ?? "",
    priority: l.priority as string,
    attempts: l.attempt_count as number,
    followup: fmtDateTime(l.next_followup_at as string | null),
    overdue: !!l.next_followup_at && new Date(l.next_followup_at as string) < new Date(),
    created: fmtDate(l.created_at as string),
  }));

  const params: Record<string, string | undefined> = { ...filters, size: String(size), sort, dir: asc ? "asc" : "desc" };
  const followupHref = (v: "today" | "missed") => {
    const s = new URLSearchParams();
    if (filters.followup !== v) s.set("followup", v);
    return `/leads?${s}`;
  };

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <h1 className="mr-2 text-lg font-extrabold">Lead List</h1>
        <LeadFilterBar lookups={lookups} current={params} isStaff={profile.role !== "agent"} />
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={followupHref("today")} className={cn(btn(filters.followup === "today" ? "success" : "outline"), filters.followup !== "today" && "!border-emerald-600 !text-emerald-600")}>
            <AlarmClock size={15} /> Today Followups
          </Link>
          <Link href={followupHref("missed")} className={cn(btn("danger"), filters.followup === "missed" && "!bg-red-600 !text-white")}>
            <AlarmClockOff size={15} /> Missed Followups
          </Link>
          <Link href="/leads/new" className={btn()}>
            Add
          </Link>
        </div>
      </Card>

      <Card>
        {error ? (
          <p className="p-6 text-red-600">Could not load leads: {error.message}</p>
        ) : (
          <LeadTable
            rows={rows}
            params={params}
            role={profile.role}
            stages={lookups.stages.map((s) => ({ value: s.id, label: s.name }))}
            users={lookups.users.map((u) => ({ value: u.id, label: `${u.full_name} (${u.emp_code})` }))}
          />
        )}
        <Pager page={page} size={size} total={count ?? 0} params={params} path="/leads" />
      </Card>
    </div>
  );
}
