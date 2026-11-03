import type { SupabaseClient } from "@supabase/supabase-js";
import { dateRange, one } from "@/lib/utils";
import { periodDates } from "@/lib/view-filters";
export function reportRange(params: Record<string, string | string[] | undefined>) {
  const preset = one(params.preset);
  const dates = preset && ["day", "week", "month"].includes(preset) ? periodDates(preset) : null;
  return dateRange(dates?.from ?? one(params.from), dates?.to ?? one(params.to), 30);
}
export const reportId = (value: string | undefined) => value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
export function reportError(error: { code?: string; message: string }) {
  if (error.code === "57014" || /statement timeout/i.test(error.message)) {
    return "The report query timed out. Apply database upgrade-013-report-performance.sql, then retry. Your filters have been kept.";
  }
  if (["PGRST202", "42883"].includes(error.code ?? "")) {
    return "The report function is missing. Apply database upgrades 012 and 013, then refresh.";
  }
  return `Could not load the report: ${error.message}`;
}
export async function allReportRows<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const result = await db.rpc(name, args).range(offset, offset + 999);
    if (result.error) return { rows: [], error: reportError(result.error) };
    rows.push(...(result.data ?? []) as T[]);
    if (!result.data || result.data.length < 1000) return { rows, error: null };
  }
  return { rows: [], error: "Choose a shorter period to display the complete report (over 50,000 rows)." };
}
