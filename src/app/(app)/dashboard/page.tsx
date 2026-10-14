import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  CalendarClock,
  Check,
  GraduationCap,
  PhoneCall,
  Plus,
  Users,
  Activity,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { Card, btn } from "@/components/ui";
import {
  addDays,
  dateRange,
  fmtDateTime,
  one,
  todayBounds,
  type SearchParams,
} from "@/lib/utils";
import { env } from "@/lib/env";
import { ConversionChart, SourceChart } from "./charts";
const RANGES = [7, 30, 90];
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();
  const days = RANGES.includes(Number(one(sp.days)))
    ? Number(one(sp.days))
    : 30;
  const range = dateRange(undefined, undefined, days);
  const { start: today, end: tomorrow } = todayBounds();
  const weekStart = addDays(tomorrow, -7);
  const prevWeekStart = addDays(tomorrow, -14);
  const count = async (
    table: string,
    col: string,
    from: Date,
    to: Date,
    minePending = false,
  ) => {
    let q = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .gte(col, from.toISOString())
      .lt(col, to.toISOString());
    if (minePending)
      q = q.eq("status", "pending").eq("assigned_to", profile.id);
    return (await q).count ?? 0;
  };
  const [
    leadsNow,
    leadsPrev,
    callsNow,
    callsPrev,
    enrolledNow,
    enrolledPrev,
    dueToday,
    missed,
    bySource,
    daily,
    recent,
    nextTasks,
  ] = await Promise.all([
    count("leads", "created_at", weekStart, tomorrow),
    count("leads", "created_at", prevWeekStart, weekStart),
    count("call_logs", "called_at", weekStart, tomorrow),
    count("call_logs", "called_at", prevWeekStart, weekStart),
    count("enrollments", "created_at", weekStart, tomorrow),
    count("enrollments", "created_at", prevWeekStart, weekStart),
    count("tasks", "due_at", today, tomorrow, true),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("assigned_to", profile.id)
      .lt("due_at", today.toISOString())
      .then((r) => r.count ?? 0),
    supabase.rpc("report_leads_by", {
      p_dim: "source",
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    }),
    supabase.rpc("report_daily", {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      p_tz: env.timezone,
    }),
    supabase
      .from("lead_activities")
      .select("id, lead_id, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("tasks")
      .select("id, title, due_at, lead:leads(id, student_name)")
      .eq("assigned_to", profile.id)
      .eq("status", "pending")
      .order("due_at")
      .limit(4),
  ]);
  const rate = (won: number, total: number) =>
    total ? (won / total) * 100 : 0;
  const convNow = rate(enrolledNow, leadsNow);
  const convPrev = rate(enrolledPrev, leadsPrev);
  const tiles = [
    {
      label: "New leads",
      value: leadsNow,
      prev: leadsPrev,
      icon: Users,
      href: "/leads",
      pct: false,
    },
    {
      label: "Conversations",
      value: callsNow,
      prev: callsPrev,
      icon: PhoneCall,
      href: "/activity",
      pct: false,
    },
    {
      label: "Enrollments",
      value: enrolledNow,
      prev: enrolledPrev,
      icon: GraduationCap,
      href: "/enrolled",
      pct: false,
    },
    {
      label: "Conversion rate",
      value: convNow,
      prev: convPrev,
      icon: Activity,
      href: "/reports",
      pct: true,
    },
  ];
  const sources = (
    (bySource.data ?? []) as { label: string; total: number }[]
  ).map((r) => ({ name: r.label, value: Number(r.total) }));
  const series = (
    (daily.data ?? []) as { day: string; leads: number; enrolled: number }[]
  ).map((r) => ({
    day: r.day.slice(5),
    leads: Number(r.leads),
    enrolled: Number(r.enrolled),
  }));

  const tasks = (nextTasks.data ?? []) as unknown as {
    id: string;
    title: string;
    due_at: string;
    lead: { id: string; student_name: string } | null;
  }[];
  return (
    <div className="space-y-6">
      {one(sp.denied) && (
        <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-red-600">
          You do not have access to that page. Ask an admin if you need it.
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Your daily perspective</p>
          <h1 className="text-[30px] font-semibold">
            A good day to move forward.
          </h1>
          <p className="mt-2 text-sm text-muted">
            Welcome back, {profile.full_name.split(" ")[0]}. Here is where
            things stand.
          </p>
        </div>
        <Link href="/leads/new" className={btn()}>
          <Plus size={16} /> New lead
        </Link>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="relative overflow-hidden rounded-2xl bg-[#254b37] p-7 text-[#f5f5e9] sm:p-8">
          <div className="relative z-10 max-w-md">
            <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-[#c4d5ae]">
              Focus for today
            </p>
            <h2 className="mt-4 text-[28px] font-semibold leading-tight">
              Every conversation
              <br />
              is a new possibility.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#d5dfd1]">
              {dueToday
                ? `You have ${dueToday} follow-up${dueToday === 1 ? "" : "s"} scheduled today. Pick up where you left off.`
                : "Your schedule is clear today. Make room for your next connection."}
            </p>
            <Link
              href="/followups"
              className="ui-button mt-6 inline-flex items-center gap-3 rounded-xl bg-[#e6edc8] px-4 py-3 text-xs font-bold text-[#254b37]"
            >
              Open my follow-ups <ArrowRight size={15} />
            </Link>
          </div>
          <div
            aria-hidden="true"
            className="absolute -bottom-20 -right-16 h-64 w-64 rounded-full border-[35px] border-[#b6ce97]/10"
          />
          <div
            aria-hidden="true"
            className="absolute -right-4 top-4 h-44 w-44 rounded-full border border-[#b6ce97]/15"
          />
        </section>
        <Card className="flex flex-col justify-between p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Your next steps</h2>
            <CalendarClock size={18} className="text-muted" />
          </div>
          <div className="my-5 grid grid-cols-2 divide-x divide-line">
            <Link href="/followups?view=today" className="pr-5">
              <span className="metric-value">{dueToday}</span>
              <p className="mt-1 text-xs text-muted">Due today</p>
            </Link>
            <Link href="/followups?view=missed" className="pl-5">
              <span
                className={`metric-value ${missed ? "text-amber-700 dark:text-amber-400" : ""}`}
              >
                {missed}
              </span>
              <p className="mt-1 text-xs text-muted">Need attention</p>
            </Link>
          </div>
          <Link
            href={missed ? "/followups?view=missed" : "/leads"}
            className="flex items-center justify-between border-t border-line pt-4 text-xs font-semibold text-brand"
          >
            {missed ? "Catch up on overdue follow-ups" : "Explore your leads"}
            <ArrowUpRight size={16} />
          </Link>
        </Card>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Your week in numbers</h2>
          <span className="text-[11px] text-muted">
            Last 7 days vs previous 7 days
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t) => {
            const delta = t.pct
              ? t.value - t.prev
              : t.prev
                ? ((t.value - t.prev) / t.prev) * 100
                : t.value
                  ? 100
                  : 0;
            const Icon = t.icon;
            return (
              <Link
                key={t.label}
                href={t.href}
                className="ui-card p-5 hover:border-brand/40"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted">{t.label}</p>
                  <Icon size={17} strokeWidth={1.5} className="text-muted" />
                </div>
                <p className="metric-value mt-3">
                  {t.pct ? `${t.value.toFixed(1)}%` : t.value}
                </p>
                <div className="mt-3 flex items-center gap-2 text-[11px]">
                  <span
                    className={
                      delta >= 0
                        ? "flex items-center gap-1 text-brand"
                        : "flex items-center gap-1 text-amber-700 dark:text-amber-400"
                    }
                  >
                    {delta >= 0 ? (
                      <ArrowUpRight size={13} />
                    ) : (
                      <ArrowDownRight size={13} />
                    )}
                    {Math.abs(delta).toFixed(1)}
                    {t.pct ? " pp" : "%"}
                  </span>
                  <span className="text-muted">vs last week</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">The bigger picture</h2>
          <p className="mt-1 text-xs text-muted">
            Lead growth and the sources behind it.
          </p>
        </div>
        <div className="segmented" aria-label="Reporting period">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/dashboard?days=${d}`}
              aria-current={d === days ? "page" : undefined}
            >
              {d} days
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card className="p-6">
          <ConversionChart data={series} />
        </Card>
        <Card className="p-6">
          <h2 className="text-base font-semibold">Where leads come from</h2>
          <p className="mt-1 text-xs text-muted">
            Source mix · last {days} days
          </p>
          <SourceChart data={sources} />
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Around the workspace</h2>
            <Link
              href="/activity"
              className="flex items-center gap-1 text-xs text-brand"
            >
              View activity <ArrowUpRight size={14} />
            </Link>
          </div>
          {recent.data?.length ? (
            <ul className="divide-y divide-line">
              {recent.data.map((a) => (
                <li key={a.id} className="flex items-start gap-3 py-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-soft text-brand">
                    <Activity size={13} />
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/leads/${a.lead_id}`}
                      className="text-xs font-medium hover:text-brand"
                    >
                      {a.summary}
                    </Link>
                    <p className="mt-1 text-[10px] text-muted">
                      {fmtDateTime(a.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-sm text-muted">
              Activity will appear here as you work with leads.
            </p>
          )}
        </Card>
        <Card className="self-start p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Coming up next</h2>
            <Link href="/followups" aria-label="View all follow-ups">
              <ArrowUpRight size={17} className="text-muted" />
            </Link>
          </div>
          {tasks.length ? (
            <ul className="divide-y divide-line">
              {tasks.map((t) => (
                <li key={t.id} className="py-4">
                  <Link
                    href={t.lead ? `/leads/${t.lead.id}` : "/followups"}
                    className="font-semibold hover:text-brand"
                  >
                    {t.lead?.student_name ?? t.title}
                  </Link>
                  <p className="mt-1 text-xs text-muted">{t.title}</p>
                  <p className="mt-2 text-[10px] text-brand">
                    {fmtDateTime(t.due_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-soft text-brand">
                <Check size={22} />
              </span>
              <p className="font-semibold">A little breathing room.</p>
              <p className="mt-2 text-xs text-muted">
                No pending follow-ups assigned to you.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
