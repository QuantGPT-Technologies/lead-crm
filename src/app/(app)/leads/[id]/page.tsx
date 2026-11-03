import { filterDates, LEAD_SORTS, leadNeighbor } from "@/lib/view-filters";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLookups, getSetting, applyLeadFilters, LEAD_FILTER_KEYS } from "@/lib/data";
import { emailProviderConfigured } from "@/lib/messaging";
import type { Activity, Lead, Row } from "@/lib/types";
import { LeadEditor } from "./lead-editor";
import { getLeadMeetings } from "@/lib/meeting-data";
import { env } from "@/lib/env";
import { one, type SearchParams } from "@/lib/utils";

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const from = one(sp.from), to = one(sp.to);
  const requestedReturn = one(sp.returnTo);
  const returnTo = requestedReturn && /^\/leads(?:\/kanban)?(?:\?[^\r\n]*)?$/.test(requestedReturn) && !requestedReturn.includes("\\") ? requestedReturn : "/leads?size=50";
  const context = new URL(returnTo, "https://crm.invalid").searchParams;
  const filters = Object.fromEntries(LEAD_FILTER_KEYS.map(key => [key, context.get(key) ?? undefined]));
  const sort = LEAD_SORTS.includes(context.get("sort") ?? "") ? context.get("sort")! : "created_at";
  const ascending = context.get("dir") === "asc";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await getSession();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  const neighbor = (following: boolean) => {
    const cursor = leadNeighbor(sort, lead[sort], id, ascending, following);
    return applyLeadFilters(supabase.from("leads").select("id"), filters).or(cursor.expression)
      .order(sort, { ascending: cursor.ascending, nullsFirst: cursor.nullsFirst }).order("id", { ascending: cursor.ascending }).limit(1).maybeSingle();
  };
  const meetingData = await getLeadMeetings(id, one(sp.calendar));

  const [lookups, activities, calls, tasks, messages, posts, enrollment, opportunities, newer, older, postUrl] = await Promise.all([
    getLookups(),
    filterDates(supabase.from("lead_activities").select("id, lead_id, type, summary, details, created_at, actor:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(300), from, to, "created_at"),
    filterDates(supabase.from("call_logs").select("id, direction, outcome, other_outcome, duration_sec, notes, called_at, user:profiles(full_name)").eq("lead_id", id).order("called_at", { ascending: false }).limit(200), from, to, "called_at"),
    filterDates(supabase.from("tasks").select("id, title, due_at, status, completed_at, assignee:profiles!tasks_assigned_to_fkey(full_name)").eq("lead_id", id).order("due_at", { ascending: false }).limit(200), from, to, "due_at"),
    filterDates(supabase.from("messages").select("id, channel, recipient, subject, body, status, error, created_at, sender:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(200), from, to, "created_at"),
    profile.role === "admin" ? filterDates(supabase.from("lead_posts").select("id, target, status, http_status, response, created_at, poster:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(50), from, to, "created_at") : Promise.resolve({ data: [] }),
    supabase.from("enrollments").select("*").eq("lead_id", id).maybeSingle(),
    supabase.from("opportunities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    neighbor(false),
    neighbor(true),
    getSetting<string>(supabase, "lead_post_webhook", ""),
  ]);

  return (
    <LeadEditor
      lead={lead as Lead}
      returnTo={returnTo}
      lookups={lookups}
      me={{ id: profile.id, name: profile.full_name, role: profile.role }}
      activities={(activities.data ?? []) as unknown as Activity[]}
      calls={(calls.data ?? []) as unknown as Row[]}
      tasks={(tasks.data ?? []) as unknown as Row[]}
      messages={(messages.data ?? []) as unknown as Row[]}
      posts={(posts.data ?? []) as unknown as Row[]}
      enrollment={(enrollment.data as Row | null) ?? null}
      opportunities={(opportunities.data ?? []) as Row[]}
      prevId={newer.data?.id ?? null}
      nextId={older.data?.id ?? null}
      emailLive={emailProviderConfigured()}
      postConfigured={/^https?:\/\//.test(postUrl)}
        meetings={meetingData.meetings}
        meetingConnection={meetingData.connection}
        meetingTimezone={env.timezone}
        meetingNow={new Date().toISOString()}
    />
  );
}

