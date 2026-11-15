import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PartnerCourse {
  id: string;
  name: string;
  university_id: string;
  university: string | null;
}

/** Active course list for matching what partners type in the Course column. */
export async function partnerCourses(admin: SupabaseClient): Promise<PartnerCourse[]> {
  const { data } = await admin.from("courses").select("id, name, university_id, university:universities(name)").eq("is_active", true).order("name");
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    university_id: c.university_id as string,
    university: (c.university as unknown as { name: string } | null)?.name ?? null,
  }));
}

/** A course name matches only when it points to exactly one active course. */
export function matchCourse(courses: PartnerCourse[], text: string) {
  const key = text.trim().toLowerCase();
  if (!key) return null;
  const exact = courses.filter((c) => c.name.toLowerCase() === key || `${c.name} - ${c.university ?? ""}`.toLowerCase() === key);
  return exact.length === 1 ? exact[0] : null;
}

/** First stage of the first active funnel: where every new lead starts. */
export async function firstStageId(admin: SupabaseClient) {
  const [{ data: funnels }, { data: stages }] = await Promise.all([
    admin.from("stage_funnels").select("id, sort_order").eq("is_active", true).order("sort_order"),
    admin.from("stages").select("id, funnel_id, sort_order").eq("is_active", true).order("sort_order"),
  ]);
  const position = new Map((funnels ?? []).map((f, i) => [f.id as string, i]));
  const sorted = (stages ?? []).filter((s) => position.has(s.funnel_id as string))
    .sort((a, b) => position.get(a.funnel_id as string)! - position.get(b.funnel_id as string)! || (a.sort_order as number) - (b.sort_order as number));
  return (sorted[0]?.id as string | undefined) ?? null;
}

export async function partnerSourceId(admin: SupabaseClient) {
  const { data } = await admin.from("lead_sources").select("id").ilike("name", "partner program").limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// Internal bookkeeping that is not shared with partners.
const HIDDEN_TYPES = ["post", "category_change"];
const HIDDEN_FIELD = /internal|owner|category/i;

export interface PartnerTimelineItem {
  id: string;
  type: string;
  summary: string;
  text: string | null;
  fields: [string, string][];
  created_at: string;
  by: "you" | "team";
  author: string | null;
}

/** The lead's shared history: everything the sales team logs plus the partner's own remarks. */
export async function partnerTimeline(admin: SupabaseClient, leadId: string, partnerId: string): Promise<PartnerTimelineItem[]> {
  const { data } = await admin
    .from("lead_activities")
    .select("id, type, summary, details, created_at, partner_id, actor:profiles(full_name)")
    .eq("lead_id", leadId)
    .not("type", "in", `(${HIDDEN_TYPES.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []).map((a) => {
    const details = (a.details ?? {}) as { text?: unknown; fields?: Record<string, unknown> };
    const fields = Object.entries(details.fields ?? {})
      .filter(([k]) => !HIDDEN_FIELD.test(k))
      .map(([k, v]) => [k, String(v ?? "")] as [string, string]);
    const mine = a.partner_id === partnerId;
    return {
      id: a.id as string,
      type: a.type as string,
      summary: a.summary as string,
      text: typeof details.text === "string" ? details.text : null,
      fields,
      created_at: a.created_at as string,
      by: mine ? "you" : "team",
      author: mine ? null : ((a.actor as unknown as { full_name: string } | null)?.full_name ?? null),
    };
  });
}
