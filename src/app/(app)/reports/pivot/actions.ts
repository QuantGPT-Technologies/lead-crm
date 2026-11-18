"use server";

import { requireRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { isPivotField, MAX_PIVOT_FIELDS, parsePivotFields, type PivotCell, type PivotLeadRow, type PivotOption, type PivotValues } from "@/lib/pivot";
import { cleanPivotFilters, describeValues, loadPivotData } from "@/lib/pivot-server";
import { allReportRows, reportError } from "@/lib/report-data";
import { dateRange } from "@/lib/utils";

/** Re-runs the pivot for a new layout without reloading the page. */
export async function loadPivot(from: string, to: string, rowsIn: string[], colsIn: string[], filtersIn: unknown):
  Promise<{ error?: string; cells?: PivotCell[]; values?: PivotValues; filterValues?: PivotValues }> {
  const { supabase } = await requireRole("admin", "manager");
  const rows = parsePivotFields((Array.isArray(rowsIn) ? rowsIn : []).join(",")).slice(0, MAX_PIVOT_FIELDS);
  const cols = parsePivotFields((Array.isArray(colsIn) ? colsIn : []).join(","), rows).slice(0, MAX_PIVOT_FIELDS - rows.length);
  return loadPivotData(supabase, dateRange(from, to, 30), rows, cols, cleanPivotFilters(filtersIn));
}

/** Every value a field has in the period (with lead counts), for the filter picker. */
export async function pivotFieldValues(from: string, to: string, field: string, filtersIn: unknown): Promise<{ error?: string; options?: PivotOption[] }> {
  const { supabase } = await requireRole("admin", "manager");
  if (!isPivotField(field)) return { error: "Unknown field" };
  // Other filters narrow the choices; this field's own filter does not, so every value stays pickable.
  const filters = cleanPivotFilters(filtersIn);
  delete filters[field];
  const range = dateRange(from, to, 30);
  const { rows, error } = await allReportRows<{ keys: string[]; n: number }>(supabase, "crm_pivot", {
    p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_dims: [field], p_tz: env.timezone, p_filters: filters,
  });
  if (error) return { error };
  const cells = rows.map((r) => ({ keys: r.keys ?? [], n: Number(r.n) }));
  const values = (await describeValues([field], cells))[field] ?? {};
  const options = cells
    .map((c) => ({ key: c.keys[0] ?? "", n: c.n, ...values[c.keys[0] ?? ""] }))
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map(({ key, n, label, color }) => ({ key, n, label: label ?? key, ...(color ? { color } : {}) }));
  return { options };
}

const EXPORT_LIMIT = 10000;

/** Every lead behind one pivot cell (up to 10,000), for the Excel download. */
export async function pivotLeadsExport(from: string, to: string, dims: string[], keys: string[], filtersIn: unknown):
  Promise<{ error?: string; rows?: PivotLeadRow[]; truncated?: boolean }> {
  const { supabase } = await requireRole("admin", "manager");
  if (!Array.isArray(dims) || !Array.isArray(keys) || dims.length !== keys.length || dims.length > MAX_PIVOT_FIELDS) return { error: "Invalid selection" };
  if (!dims.every((d) => typeof d === "string" && isPivotField(d)) || !keys.every((k) => typeof k === "string" && k.length <= 200)) return { error: "Invalid selection" };
  const range = dateRange(from, to, 30);
  const args = { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_dims: dims, p_keys: keys, p_tz: env.timezone, p_filters: cleanPivotFilters(filtersIn) };
  const rows: PivotLeadRow[] = [];
  // The API returns at most 1,000 rows per request, so read in pages.
  for (let offset = 0; offset < EXPORT_LIMIT; offset += 1000) {
    const { data, error } = await supabase.rpc("crm_pivot_leads", args)
      .select("id, lead_no, student_name, mobile, city, state, attempt_count, created_at, remarks, product, stage:stages(name, color), sub_stage:sub_stages(name), course:courses(name), owner:profiles!leads_owner_id_fkey(full_name)")
      .range(offset, offset + 999);
    if (error) return { error: reportError(error) };
    const page = (data ?? []) as unknown as PivotLeadRow[];
    rows.push(...page);
    if (page.length < 1000) return { rows };
  }
  return { rows, truncated: true };
}
