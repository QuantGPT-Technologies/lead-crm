import { filterDates, LEAD_SORTS, leadNeighbor } from "@/lib/view-filters";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLookups, getSetting, applyLeadFilters, LEAD_FILTER_KEYS } from "@/lib/data";
import { emailProviderConfigured } from "@/lib/messaging";
import type { Activity, Lead, Row } from "@/lib/types";
import { LeadEditor, NavArrow } from "./lead-editor";
import { Suspense } from "react";
import { getLeadMeetings } from "@/lib/meeting-data";
import { env } from "@/lib/env";
import { one, type SearchParams } from "@/lib/utils";
import { createAdminClient } from "@/lib/supabase/server";
import { Handshake } from "lucide-react";

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const from = one(sp.from), to = one(sp.to);
  const requestedReturn = one(sp.returnTo);
  const returnTo = requestedReturn && /^\/leads(?:\/kanban)?(?:\?[^\r\n]*)?$/.test(requestedReturn) && !requestedReturn.includes("\\") ? requestedReturn : "/leads?size=50";
  const context = new URL(returnTo, "https://crm.invalid").searchParams;
  const filters = Object.fromEntries(LEAD_FILTER_KEYS.map(key => [key, context.get(key) ?? undefined]));
  // Same split as the list: rechurned leads are only stepped through from the Rechurned tab.
  if (filters.churn !== "yes") filters.churn = "no";
  const sort = LEAD_SORTS.includes(context.get("sort") ?? "") ? context.get("sort")! : "created_at";
  const ascending = context.get("dir") === "asc";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await getSession();

  // Everything except the previous/next lookups (which need the lead) starts at once.
  const leadQuery = supabase.from("leads").select("*").eq("id", id).maybeSingle();
  const meetingQuery = getLeadMeetings(id, one(sp.calendar));
  meetingQuery.catch(() => {}); // awaited below; avoids an unhandled rejection if the lead is missing
  const detailQueries = Promise.all([
    getLookups(),
    filterDates(supabase.from("lead_activities").select("id, lead_id, type, summary, details, created_at, actor:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(300), from, to, "created_at"),
    filterDates(supabase.from("call_logs").select("id, direction, outcome, other_outcome, duration_sec, notes, called_at, user:profiles(full_name)").eq("lead_id", id).order("called_at", { ascending: false }).limit(200), from, to, "called_at"),
    filterDates(supabase.from("tasks").select("id, title, due_at, status, completed_at, assignee:profiles!tasks_assigned_to_fkey(full_name)").eq("lead_id", id).order("due_at", { ascending: false }).limit(200), from, to, "due_at"),
    filterDates(supabase.from("messages").select("id, channel, recipient, subject, body, status, error, created_at, sender:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(200), from, to, "created_at"),
    profile.role === "admin" ? filterDates(supabase.from("lead_posts").select("id, target, status, http_status, response, created_at, poster:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(50), from, to, "created_at") : Promise.resolve({ data: [] }),
    supabase.from("enrollments").select("*").eq("lead_id", id).maybeSingle(),
    supabase.from("opportunities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    getSetting<string>(supabase, "lead_post_webhook", ""),
  ]);

  detailQueries.catch(() => {}); // awaited below
  const { data: lead } = await leadQuery;
  if (!lead) notFound();
  const neighbor = (following: boolean) => {
    const cursor = leadNeighbor(sort, lead[sort], id, ascending, following);
    return applyLeadFilters(supabase.from("leads").select("id"), filters).or(cursor.expression)
      .order(sort, { ascending: cursor.ascending, nullsFirst: cursor.nullsFirst }).order("id", { ascending: cursor.ascending }).limit(1).maybeSingle();
  };
  // Partner leads: the partner sees this lead's history, so say so where staff write it.
  // A lead transferred away from an agent stays visible to them (primary owner) but read-only.
  const transferredTo: Promise<string | null> = profile.role === "agent" && lead.owner_id !== profile.id
    ? Promise.resolve(createAdminClient().from("profiles").select("full_name").eq("id", lead.owner_id ?? "").maybeSingle().then((r) => (r.data?.full_name as string | undefined) ?? "the unassigned pool", () => "someone else"))
    : Promise.resolve(null);
  const partnerQuery = lead.partner_id
    ? createAdminClient().from("partners").select("full_name, organization, partner_code").eq("id", lead.partner_id).maybeSingle().then((r) => r.data)
    : Promise.resolve(null);
  // Previous / next need the lead first; they stream in after the page instead of delaying it.
  const neighbors = Promise.all([neighbor(false), neighbor(true)]);
  neighbors.catch(() => {});
  const [meetingData, [lookups, activities, calls, tasks, messages, posts, enrollment, opportunities, postUrl], partner, newOwner] =
    await Promise.all([meetingQuery, detailQueries, partnerQuery, transferredTo]);

  return (
    <>
    <LeadEditor
      readOnly={!!newOwner}
      notes={<>
        {partner && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-semibold text-amber-700"
            title="The partner can see this lead's history (notes, calls, stage changes) and can add remarks.">
            <Handshake size={12} /> Partner lead · {partner.full_name}{partner.organization ? ` (${partner.organization})` : ""} · {partner.partner_code}
          </span>
        )}
        {newOwner && (
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 font-semibold text-amber-700"
            title="You can still view this lead and its history, but only its current owner can change it.">
            Transferred to {newOwner} · view only
          </span>
        )}
      </>}
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
      nav={
        <Suspense fallback={<><NavArrow returnTo={returnTo} id={null} dir="prev" /><NavArrow returnTo={returnTo} id={null} dir="next" /></>}>
          <LeadNeighbors neighbors={neighbors} returnTo={returnTo} />
        </Suspense>
      }
      emailLive={emailProviderConfigured()}
      postConfigured={/^https?:\/\//.test(postUrl)}
        meetings={meetingData.meetings}
        meetingConnection={meetingData.connection}
        meetingTimezone={env.timezone}
        meetingNow={new Date().toISOString()}
    />
    </>
  );
}

async function LeadNeighbors({ neighbors, returnTo }: { neighbors: Promise<{ data: { id: string } | null }[]>; returnTo: string }) {
  const [newer, older] = await neighbors.catch(() => [{ data: null }, { data: null }]);
  return <>
    <NavArrow returnTo={returnTo} id={newer.data?.id ?? null} dir="prev" />
    <NavArrow returnTo={returnTo} id={older.data?.id ?? null} dir="next" />
  </>;
}
