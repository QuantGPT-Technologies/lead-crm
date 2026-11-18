import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { allReportRows } from "@/lib/report-data";
import { createAdminClient } from "@/lib/supabase/server";
import { isPivotField, MAX_PIVOT_FIELDS, pivotFieldLabel, type PivotCell, type PivotFilters, type PivotValues } from "@/lib/pivot";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type NameRow = { id: string; name: string; color?: string; sort?: number; funnel?: string; stage?: string };

/** Display name, colour and sort position for every value that appears in the result. */
export async function describeValues(dims: string[], cells: PivotCell[]): Promise<PivotValues> {
  const admin = createAdminClient();
  const need = (d: string) => dims.includes(d);
  const names = async (on: boolean, table: string, cols: string, map: (r: Record<string, unknown>) => NameRow) =>
    on ? ((await admin.from(table).select(cols)).data ?? []).map((r) => map(r as unknown as Record<string, unknown>)) : [];
  // All rows, active or not: an old lead can still point at a retired stage or source.
  const [funnels, stages, subs, sources, users, universities, courses, partners] = await Promise.all([
    names(need("stage") || need("sub_stage"), "stage_funnels", "id, name, sort_order", (r) => ({ id: r.id as string, name: r.name as string, sort: r.sort_order as number })),
    names(need("stage") || need("sub_stage"), "stages", "id, name, color, sort_order, funnel_id", (r) => ({ id: r.id as string, name: r.name as string, color: r.color as string, sort: r.sort_order as number, funnel: r.funnel_id as string })),
    names(need("sub_stage"), "sub_stages", "id, name, color, sort_order, stage_id", (r) => ({ id: r.id as string, name: r.name as string, color: r.color as string, sort: r.sort_order as number, stage: r.stage_id as string })),
    names(need("source"), "lead_sources", "id, name", (r) => ({ id: r.id as string, name: r.name as string })),
    names(need("owner"), "profiles", "id, full_name", (r) => ({ id: r.id as string, name: r.full_name as string })),
    names(need("university"), "universities", "id, name", (r) => ({ id: r.id as string, name: r.name as string })),
    names(need("course"), "courses", "id, name", (r) => ({ id: r.id as string, name: r.name as string })),
    names(need("partner"), "partners", "id, full_name, organization", (r) => ({ id: r.id as string, name: r.organization ? `${r.full_name} (${r.organization})` : (r.full_name as string) })),
  ]);
  const funnelPos = new Map([...funnels].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((f, i) => [f.id, i]));
  const stageRank = new Map(stages.map((s) => [s.id, (funnelPos.get(s.funnel ?? "") ?? 99) * 10000 + (s.sort ?? 0)]));
  const byId = (rows: NameRow[]) => new Map(rows.map((r) => [r.id, r]));
  const lookup: Record<string, Map<string, NameRow>> = {
    stage: byId(stages), sub_stage: byId(subs), source: byId(sources), owner: byId(users),
    university: byId(universities), course: byId(courses), partner: byId(partners),
  };

  const out: PivotValues = {};
  dims.forEach((dim, i) => {
    const keys = [...new Set(cells.map((c) => c.keys[i] ?? ""))];
    const described = keys.map((key) => {
      let label = key || `No ${pivotFieldLabel(dim).toLowerCase()}`;
      let color: string | undefined;
      let order: number | string = label.toLowerCase();
      const known = lookup[dim]?.get(key);
      if (lookup[dim]) {
        label = key ? known?.name ?? "(deleted)" : dim === "owner" ? "Unassigned" : dim === "partner" ? "Not from a partner" : `No ${pivotFieldLabel(dim).toLowerCase()}`;
        color = known?.color;
        if (dim === "stage") order = known ? stageRank.get(key) ?? 0 : Number.MAX_SAFE_INTEGER;
        if (dim === "sub_stage") {
          const stageId = known?.stage ?? "";
          order = known ? (stageRank.get(stageId) ?? 0) * 1000 + (known.sort ?? 0) : Number.MAX_SAFE_INTEGER;
        }
      } else if (dim === "attempt" || dim === "calls") {
        const n = key === "10+" ? 10 : Number(key);
        label = `${key} ${dim === "attempt" ? (key === "1" ? "attempt" : "attempts") : key === "1" ? "call" : "calls"}`;
        order = n;
      } else if (dim.endsWith("_day") && key) {
        const [y, m, d] = key.split("-");
        label = `${d} ${MONTHS[Number(m) - 1]} ${y}`;
        order = key;
      } else if (dim === "created_month" && key) {
        const [y, m] = key.split("-");
        label = `${MONTHS[Number(m) - 1]} ${y}`;
        order = key;
      } else if (dim === "rechurn") label = key === "yes" ? "Rechurned" : "Never rechurned";
      else if (dim === "dnd") label = key === "yes" ? "Do not disturb" : "Can contact";
      else if (dim === "priority" && key) label = key[0].toUpperCase() + key.slice(1);
      else if (dim === "category" && key) label = `Category ${key}`;
      return { key, label, color, order, blank: !key };
    });
    described.sort((a, b) => Number(a.blank) - Number(b.blank)
      || (typeof a.order === "number" && typeof b.order === "number" ? a.order - b.order : String(a.order).localeCompare(String(b.order))));
    out[dim] = Object.fromEntries(described.map((v, rank) => [v.key, { label: v.label, rank, ...(v.color ? { color: v.color } : {}) }]));
  });
  return out;
}


/** Accepts only known fields and short string values; anything else is dropped. */
export function cleanPivotFilters(input: unknown): PivotFilters {
  let raw = input;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { return {}; } }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PivotFilters = {};
  for (const [field, list] of Object.entries(raw as Record<string, unknown>).slice(0, 12)) {
    if (!isPivotField(field) || !Array.isArray(list)) continue;
    const vals = [...new Set(list.filter((v): v is string => typeof v === "string" && v.length <= 200))].slice(0, 500);
    if (vals.length) out[field] = vals;
  }
  return out;
}

/** Counts for the chosen rows and columns, plus display names for every value in them. */
export async function loadPivotData(db: SupabaseClient, range: { from: Date; to: Date }, rows: string[], cols: string[], filters: PivotFilters) {
  const dims = [...rows, ...cols].slice(0, MAX_PIVOT_FIELDS);
  const args = { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_tz: env.timezone, p_filters: filters };
  let cells: PivotCell[];
  if (dims.length) {
    const result = await allReportRows<{ keys: string[]; n: number }>(db, "crm_pivot", { ...args, p_dims: dims });
    if (result.error) return { error: friendly(result.error) };
    cells = result.rows.map((r) => ({ keys: r.keys ?? [], n: Number(r.n) }));
  } else {
    const result = await db.rpc("crm_pivot", { ...args, p_dims: [] });
    if (result.error) return { error: friendly(result.error.message, result.error.code) };
    cells = [{ keys: [], n: ((result.data ?? []) as { n: number }[]).reduce((s, r) => s + Number(r.n), 0) }];
  }
  const fields = Object.keys(filters);
  const longest = Math.max(0, ...fields.map((k) => filters[k].length));
  // Names for the filtered values too, so filter chips can show them.
  const filterCells = Array.from({ length: longest }, (_, i) => ({ keys: fields.map((k) => filters[k][i] ?? filters[k][0]), n: 0 }));
  const [values, filterValues] = await Promise.all([describeValues(dims, cells), fields.length ? describeValues(fields, filterCells) : Promise.resolve({})]);
  return { cells, values, filterValues };
}

function friendly(message: string, code?: string) {
  if (message.includes("function is missing") || code === "PGRST202" || code === "42883")
    return "The pivot report needs database upgrades 015 and 016 (supabase/upgrade-015-pivot-report.sql, then upgrade-016-pivot-filters.sql). Apply them in Supabase, then refresh.";
  return message;
}
