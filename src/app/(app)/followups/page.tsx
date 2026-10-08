import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { Card, Empty, PageHeader, Select, btn } from "@/components/ui";
import { cn, fmtDateTime, one, todayBounds, type SearchParams } from "@/lib/utils";
import { TaskButtons } from "./task-buttons";

const VIEWS = [["today", "Today"], ["missed", "Missed"], ["upcoming", "Upcoming"], ["done", "Completed"]] as const;

export default async function FollowupsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();
  const isStaff = profile.role !== "agent";
  const view = VIEWS.some(([v]) => v === one(sp.view)) ? one(sp.view)! : "today";
  // staff can look at one person's follow-ups or everyone's ("all"); agents only see their own
  const who = isStaff ? (one(sp.user) ?? profile.id) : profile.id;
  const { start, end } = todayBounds();

  let q = supabase
    .from("tasks")
    .select("id, title, due_at, status, completed_at, lead:leads(id, student_name, mobile, stage:stages(name)), assignee:profiles!tasks_assigned_to_fkey(full_name)")
    .limit(200);
  if (who !== "all" && /^[0-9a-f-]{36}$/i.test(who)) q = q.eq("assigned_to", who);
  if (view === "done") q = q.eq("status", "done").order("completed_at", { ascending: false });
  else {
    q = q.eq("status", "pending").order("due_at", { ascending: true });
    if (view === "today") q = q.gte("due_at", start.toISOString()).lt("due_at", end.toISOString());
    if (view === "missed") q = q.lt("due_at", start.toISOString());
    if (view === "upcoming") q = q.gte("due_at", end.toISOString());
  }
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const users = isStaff ? (await getLookups()).users : [];
  const href = (v: string) => `/followups?view=${v}${isStaff ? `&user=${who}` : ""}`;

  return (
    <>
      <PageHeader title="Followups">
        {isStaff && (
          <form className="flex gap-2">
            <input type="hidden" name="view" value={view} />
            <Select name="user" defaultValue={who} aria-label="Whose follow-ups" options={[{ value: "all", label: "Everyone" }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} placeholder={null} className="!h-9 !w-48" />
            <button type="submit" className={btn("outline")}>
              Show
            </button>
          </form>
        )}
        {VIEWS.map(([v, label]) => (
          <Link key={v} href={href(v)} className={btn(v === view ? "primary" : "outline")}>
            {label}
          </Link>
        ))}
      </PageHeader>

      <Card className="overflow-x-auto">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["Due", "Lead", "Mobile", "Stage", "Task", "Assigned to", ""].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const lead = t.lead as { id: string; student_name: string; mobile: string; stage: { name: string } | null } | null;
              const late = t.status === "pending" && new Date(t.due_at as string) < new Date();
              return (
                <tr key={t.id as string}>
                  <td className={cn(late && "font-bold text-red-600")}>{fmtDateTime(t.due_at as string)}</td>
                  <td>
                    {lead && (
                      <Link href={`/leads/${lead.id}`} className="font-bold text-brand">
                        {lead.student_name}
                      </Link>
                    )}
                  </td>
                  <td>{lead && <a href={`tel:${lead.mobile}`}>{lead.mobile}</a>}</td>
                  <td>{lead?.stage?.name ?? ""}</td>
                  <td>{t.title as string}</td>
                  <td>{(t.assignee as { full_name: string } | null)?.full_name ?? ""}</td>
                  <td>{t.status === "pending" ? <TaskButtons id={t.id as string} /> : `Done ${fmtDateTime(t.completed_at as string)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>Nothing here. {view === "today" ? "No follow-ups are due today." : ""}</Empty>}
      </Card>
    </>
  );
}
