import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MASTERS, type MasterTable } from "@/lib/masters";
import type { Row } from "@/lib/types";

/** Rows of one master table (including inactive ones) plus the dropdown options its form needs. */
export async function loadMaster(supabase: SupabaseClient, table: MasterTable) {
  const def = MASTERS[table];
  const refTables = [...new Set(def.fields.map((f) => f.ref).filter((r): r is MasterTable => !!r))];
  const [{ data: rows }, ...refData] = await Promise.all([
    supabase.from(table).select("*").order(def.order).limit(1000),
    ...refTables.map((t) => supabase.from(t).select("id, name").order("name").limit(1000)),
  ]);
  const refs = Object.fromEntries(refTables.map((t, i) => [t, (refData[i].data ?? []).map((r) => ({ value: r.id as string, label: r.name as string }))]));
  return { rows: (rows ?? []) as Row[], refs };
}
