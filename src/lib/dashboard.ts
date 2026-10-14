import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/utils";
export interface DashboardCounts {
  leadsNow: number; leadsPrev: number; callsNow: number; callsPrev: number;
  enrolledNow: number; enrolledPrev: number; dueToday: number; missed: number;
}
let batchUnavailableUntil = 0;
export async function getDashboardCounts(supabase: SupabaseClient, userId: string, today: Date, tomorrow: Date): Promise<DashboardCounts> {
  const result = Date.now() < batchUnavailableUntil ? null : await supabase.rpc("crm_dashboard_counts", { p_today: today.toISOString(), p_tomorrow: tomorrow.toISOString() });
  if (result && !result.error && result.data) return result.data as DashboardCounts;
  if (result?.error && !["PGRST202", "42883"].includes(result.error.code)) throw new Error(`Could not load dashboard: ${result.error.message}`);
  if (result?.error) batchUnavailableUntil = Date.now() + 60_000;
  const week = addDays(tomorrow, -7), previous = addDays(tomorrow, -14);
  const count = async (table: string, column: string, from: Date, to: Date) => {
    const r = await supabase.from(table).select("id", { count: "exact", head: true }).gte(column, from.toISOString()).lt(column, to.toISOString());
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  };
  const tasks = async (overdue: boolean) => {
    let q = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", userId).eq("status", "pending").lt("due_at", (overdue ? today : tomorrow).toISOString());
    if (!overdue) q = q.gte("due_at", today.toISOString());
    const r = await q; if (r.error) throw new Error(r.error.message); return r.count ?? 0;
  };
  const [leadsNow, leadsPrev, callsNow, callsPrev, enrolledNow, enrolledPrev, dueToday, missed] = await Promise.all([
    count("leads", "created_at", week, tomorrow), count("leads", "created_at", previous, week),
    count("call_logs", "called_at", week, tomorrow), count("call_logs", "called_at", previous, week),
    count("enrollments", "created_at", week, tomorrow), count("enrollments", "created_at", previous, week), tasks(false), tasks(true),
  ]);
  return { leadsNow, leadsPrev, callsNow, callsPrev, enrolledNow, enrolledPrev, dueToday, missed };
}
