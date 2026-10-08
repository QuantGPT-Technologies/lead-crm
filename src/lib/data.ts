import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Lookups } from "@/lib/types";
import { cleanSearch, todayBounds, startOfDay, addDays } from "@/lib/utils";

/** Dropdown data used across the app. Loaded once per request. */
export const getLookups = cache(async (): Promise<Lookups> => {
  const { supabase } = await getSession();
  const active = <T>(table: string, cols: string, order = "name") =>
    supabase.from(table).select(cols).eq("is_active", true).order(order).then((r) => (r.data ?? []) as T[]);

  const [sources, universities, courses, funnels, stages, subStages, users, templates] = await Promise.all([
    active<Lookups["sources"][number]>("lead_sources", "id, name"),
    active<Lookups["universities"][number]>("universities", "id, name"),
    active<Lookups["courses"][number]>("courses", "id, name, university_id, fee"),
    active<Lookups["funnels"][number]>("stage_funnels", "id, name, sort_order", "sort_order"),
    active<Lookups["stages"][number]>("stages", "id, name, funnel_id, color, sort_order, is_won, is_lost", "sort_order"),
    active<Lookups["subStages"][number]>("sub_stages", "id, name, stage_id, sort_order", "sort_order"),
    active<Lookups["users"][number]>("profiles", "id, full_name, emp_code, role", "full_name"),
    active<Lookups["templates"][number]>("message_templates", "id, name, channel, subject, body"),
  ]);

  // order stages by their funnel first, then their own position
  const funnelPos = new Map(funnels.map((f, i) => [f.id, i]));
  stages.sort((a, b) => (funnelPos.get(a.funnel_id) ?? 0) - (funnelPos.get(b.funnel_id) ?? 0) || a.sort_order - b.sort_order);
  return { sources, universities, courses, funnels, stages, subStages, users, templates };
});

export interface LeadFilters {
  q?: string;
  stage?: string;
  source?: string;
  owner?: string; // profile id or "none"
  university?: string;
  course?: string;
  product?: string;
  priority?: string;
  attempt?: string; // "0" | "1" | "2" | "3+"
  followup?: string; // "today" | "missed"
  from?: string;
  to?: string;
  batch?: string;
}

export const LEAD_FILTER_KEYS: (keyof LeadFilters)[] = [
  "q", "stage", "source", "owner", "university", "course", "product", "priority", "attempt", "followup", "from", "to", "batch",
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

/** Applies list filters to any query on `leads`. Ids are validated so bad URLs cannot break the query. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLeadFilters<Q extends { eq: any; or: any; is: any; gte: any; lt: any; ilike: any }>(query: Q, f: LeadFilters): Q {
  let q = query;
  const id = (v?: string) => (v && UUID.test(v) ? v : undefined);
  const search = f.q ? cleanSearch(f.q) : "";
  if (search) {
    q = q.or(
      `student_name.ilike.%${search}%,mobile.ilike.%${search}%,email.ilike.%${search}%,lead_no.ilike.%${search}%,alt_mobile.ilike.%${search}%`,
    );
  }
  if (id(f.stage)) q = q.eq("stage_id", f.stage);
  if (id(f.source)) q = q.eq("source_id", f.source);
  if (id(f.university)) q = q.eq("university_id", f.university);
  if (id(f.course)) q = q.eq("course_id", f.course);
  if (id(f.batch)) q = q.eq("upload_batch_id", f.batch);
  if (f.owner === "none") q = q.is("owner_id", null);
  else if (id(f.owner)) q = q.eq("owner_id", f.owner);
  if (f.product) q = q.ilike("product", `%${cleanSearch(f.product)}%`);
  if (f.priority && ["hot", "warm", "cold"].includes(f.priority)) q = q.eq("priority", f.priority);
  if (f.attempt === "3+") q = q.gte("attempt_count", 3);
  else if (f.attempt && /^[0-2]$/.test(f.attempt)) q = q.eq("attempt_count", Number(f.attempt));
  if (f.followup === "today") {
    const { start, end } = todayBounds();
    q = q.gte("next_followup_at", start.toISOString()).lt("next_followup_at", end.toISOString());
  } else if (f.followup === "missed") {
    q = q.lt("next_followup_at", new Date().toISOString());
  }
  if (f.from && DATE.test(f.from)) q = q.gte("created_at", startOfDay(f.from).toISOString());
  if (f.to && DATE.test(f.to)) q = q.lt("created_at", addDays(startOfDay(f.to), 1).toISOString());
  return q;
}

/**
 * Writes history rows. Call it only after a row-level-security guarded read or write on the
 * same leads has succeeded: it uses the service role so the entry is still recorded when the
 * action itself (e.g. reassigning to another team) moved the lead out of the actor's view.
 */
export async function logActivity(
  _supabase: SupabaseClient,
  rows: { lead_id: string; actor_id: string; type: string; summary: string; details?: Record<string, unknown> }[],
) {
  for (let i = 0; i < rows.length; i += 500) {
    await createAdminClient().from("lead_activities").insert(rows.slice(i, i + 500));
  }
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export async function getSetting<T>(supabase: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
