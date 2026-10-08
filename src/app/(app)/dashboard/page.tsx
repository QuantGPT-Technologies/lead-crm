import Link from "next/link";
import { Eye } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Card, btn } from "@/components/ui";
import { addDays, dateRange, fmtDateTime, one, todayBounds, type SearchParams } from "@/lib/utils";
import { env } from "@/lib/env";
import { ConversionChart, SourceChart } from "./charts";

const RANGES = [7, 30, 90];

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();
  const days = RANGES.includes(Number(one(sp.days))) ? Number(one(sp.days)) : 30;
  const range = dateRange(undefined, undefined, days);
  const { start: today, end: tomorrow } = todayBounds();
  const weekStart = addDays(tomorrow, -7);
  const prevWeekStart = addDays(tomorrow, -14);

  /** Rows of `table` whose `col` falls in [from, to), optionally only this user's pending tasks. */
  const count = async (table: string, col: string, from: Date, to: Date, minePending = false) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).gte(col, from.toISOString()).lt(col, to.toISOString());
    if (minePending) q = q.eq("status", "pending").eq("assigned_to", profile.id);
    return (await q).count ?? 0;
  };

  const [leadsNow, leadsPrev, callsNow, callsPrev, enrolledNow, enrolledPrev, dueToday, missed, bySource, daily, recent] = await Promise.all([
    count("leads", "created_at", weekStart, tomorrow),
    count("leads", "created_at", prevWeekStart, weekStart),
    count("call_logs", "called_at", weekStart, tomorrow),
    count("call_logs", "called_at", prevWeekStart, weekStart),
    count("enrollments", "created_at", weekStart, tomorrow),
    count("enrollments", "created_at", prevWeekStart, weekStart),
    count("tasks", "due_at", today, tomorrow, true),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("status", "pending").eq("assigned_to", profile.id).lt("due_at", today.toISOString()).then((r) => r.count ?? 0),
    supabase.rpc("report_leads_by", { p_dim: "source", p_from: range.from.toISOString(), p_to: range.to.toISOString() }),
    supabase.rpc("report_daily", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_tz: env.timezone }),
    supabase.from("lead_activities").select("id, lead_id, summary, created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  const rate = (won: number, total: number) => (total ? (won / total) * 100 : 0);
  const convNow = rate(enrolledNow, leadsNow);
  const convPrev = rate(enrolledPrev, leadsPrev);
  const tiles = [
    { label: "New leads (7 days)", value: leadsNow, prev: leadsPrev, text: String(leadsPrev), gradient: "linear-gradient(135deg,#22b8cf,#5ad1e6)" },
    { label: "Calls logged (7 days)", value: callsNow, prev: callsPrev, text: String(callsPrev), gradient: "linear-gradient(135deg,#8b5cf6,#a78bfa)" },
    { label: "Enrolled (7 days)", value: enrolledNow, prev: enrolledPrev, text: String(enrolledPrev), gradient: "linear-gradient(135deg,#3b82f6,#60a5fa)" },
    { label: "Conversion (7 days)", value: convNow, prev: convPrev, text: `${convPrev.toFixed(2)}%`, gradient: "linear-gradient(135deg,#d946ef,#e879f9)", pct: true },
  ];
  const sources = ((bySource.data ?? []) as { label: string; total: number }[]).map((r) => ({ name: r.label, value: Number(r.total) }));
  const series = ((daily.data ?? []) as { day: string; leads: number; enrolled: number }[]).map((r) => ({ day: r.day.slice(5), leads: Number(r.leads), enrolled: Number(r.enrolled) }));

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <h1 className="text-lg font-extrabold">Dashboard</h1>
        <Link href="/followups" className="text-sm font-semibold text-brand">
          {dueToday} follow-up(s) due today{missed ? ` · ${missed} missed` : ""}
        </Link>
        <div className="ml-auto flex gap-1">
          {RANGES.map((d) => (
            <Link key={d} href={`/dashboard?days=${d}`} className={btn(d === days ? "primary" : "outline", "h-8")}>
              {d} days
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => {
          const delta = t.pct ? t.value - t.prev : t.prev ? ((t.value - t.prev) / t.prev) * 100 : t.value ? 100 : 0;
          return (
            <div key={t.label} className="rounded-lg p-5 text-white shadow" style={{ background: t.gradient }}>
              <p className="text-sm font-semibold text-white/90">{t.label}</p>
              <p className="mt-1 flex items-center gap-3">
                <span className="text-3xl font-extrabold">{t.pct ? `${t.value.toFixed(2)}%` : t.value}</span>
                <span className="rounded bg-white/25 px-2 py-0.5 text-xs font-bold">
                  {delta >= 0 ? "+" : "-"} {Math.abs(delta).toFixed(2)}%
                </span>
              </p>
              <p className="mt-3 flex items-center gap-2 text-sm">
                <Eye size={15} /> Previous week {t.text}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <Card className="p-5">
          <h2 className="mb-2 text-lg font-bold">Leads by Source</h2>
          <SourceChart data={sources} />
        </Card>
        <Card className="p-5">
          <ConversionChart data={series} />
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-lg font-bold">Recent Activity</h2>
        {recent.data?.length ? (
          <ul className="divide-y divide-line">
            {recent.data.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/leads/${a.lead_id}`} className="font-semibold hover:text-brand">
                  {a.summary}
                </Link>
                <span className="text-xs text-muted">{fmtDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No lead data available</p>
        )}
      </Card>
    </div>
  );
}
