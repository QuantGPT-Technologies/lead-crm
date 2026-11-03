import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addDays, todayBounds } from "@/lib/utils";

export async function GET() {
  const { supabase, profile } = await getSession();
  const horizon = addDays(todayBounds().end, 7).toISOString();
  const [tasks, leads] = await Promise.all([
    supabase.from("tasks").select("id,title,due_at,lead_id").eq("assigned_to", profile.id).eq("status", "pending").lt("due_at", horizon).order("due_at").limit(40),
    supabase.from("leads").select("id,student_name,last_activity_at,last_activity_summary").eq("owner_id", profile.id).not("last_activity_at", "is", null).order("last_activity_at", { ascending: false }).limit(20),
  ]);
  if (tasks.error || leads.error) return NextResponse.json({ error: "Notifications could not be loaded. Check database upgrade-012." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const now = Date.now();
  const items = [
    ...(tasks.data ?? []).map(task => ({ id: `task:${task.id}:${task.due_at}:${new Date(task.due_at).getTime() < now ? "overdue" : "upcoming"}`, title: task.title, detail: new Date(task.due_at).getTime() < now ? "Overdue follow-up" : "Upcoming follow-up", at: task.due_at, href: `/leads/${task.lead_id}`, urgent: new Date(task.due_at).getTime() < now })),
    ...(leads.data ?? []).map(lead => ({ id: `lead:${lead.id}:${lead.last_activity_at}`, title: lead.student_name, detail: lead.last_activity_summary ?? "Lead updated", at: lead.last_activity_at!, href: `/leads/${lead.id}`, urgent: false })),
  ];
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
