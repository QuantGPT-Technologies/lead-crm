import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getLookups, getSetting } from "@/lib/data";
import { emailProviderConfigured } from "@/lib/messaging";
import type { Activity, Lead, Row } from "@/lib/types";
import { LeadEditor } from "./lead-editor";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await getSession();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const [lookups, activities, calls, tasks, messages, posts, enrollment, opportunities, newer, older, postUrl] = await Promise.all([
    getLookups(),
    supabase.from("lead_activities").select("id, lead_id, type, summary, details, created_at, actor:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(300),
    supabase.from("call_logs").select("id, direction, outcome, duration_sec, notes, called_at, user:profiles(full_name)").eq("lead_id", id).order("called_at", { ascending: false }).limit(200),
    supabase.from("tasks").select("id, title, due_at, status, completed_at, assignee:profiles!tasks_assigned_to_fkey(full_name)").eq("lead_id", id).order("due_at", { ascending: false }).limit(200),
    supabase.from("messages").select("id, channel, recipient, subject, body, status, error, created_at, sender:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("lead_posts").select("id, target, status, http_status, response, created_at, poster:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("enrollments").select("*").eq("lead_id", id).maybeSingle(),
    supabase.from("opportunities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("leads").select("id").gt("created_at", lead.created_at).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("leads").select("id").lt("created_at", lead.created_at).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    getSetting<string>(supabase, "lead_post_webhook", ""),
  ]);

  return (
    <LeadEditor
      lead={lead as Lead}
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
    />
  );
}

