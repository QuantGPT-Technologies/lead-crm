import Link from "next/link";
import { ArrowUpRight, CalendarClock, Phone, CheckCircle2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { Card, Empty, PageHeader, Select, btn } from "@/components/ui";
import {
  cn,
  fmtDateTime,
  one,
  todayBounds,
  type SearchParams,
} from "@/lib/utils";
import { TaskButtons } from "./task-buttons";

const VIEWS = [
  ["today", "Today"],
  ["missed", "Missed"],
  ["upcoming", "Upcoming"],
  ["done", "Completed"],
] as const;

export default async function FollowupsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const { supabase, profile } = await getSession();
  const isStaff = profile.role !== "agent";
  const view = VIEWS.some(([v]) => v === one(sp.view))
    ? one(sp.view)!
    : "today";
  // staff can look at one person's follow-ups or everyone's ("all"); agents only see their own
  const who = isStaff ? (one(sp.user) ?? profile.id) : profile.id;
  const { start, end } = todayBounds();

  let q = supabase
    .from("tasks")
    .select(
      "id, title, due_at, status, completed_at, lead:leads(id, student_name, mobile, stage:stages(name)), assignee:profiles!tasks_assigned_to_fkey(full_name)",
    )
    .limit(200);
  if (who !== "all" && /^[0-9a-f-]{36}$/i.test(who))
    q = q.eq("assigned_to", who);
  if (view === "done")
    q = q.eq("status", "done").order("completed_at", { ascending: false });
  else {
    q = q.eq("status", "pending").order("due_at", { ascending: true });
    if (view === "today")
      q = q.gte("due_at", start.toISOString()).lt("due_at", end.toISOString());
    if (view === "missed") q = q.lt("due_at", start.toISOString());
    if (view === "upcoming") q = q.gte("due_at", end.toISOString());
  }
  const { data, error } = await q;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const users = isStaff ? (await getLookups()).users : [];
  const href = (v: string) =>
    `/followups?view=${v}${isStaff ? `&user=${who}` : ""}`;

  return (
    <>
      <PageHeader title="Followups">
        {isStaff && (
          <form className="flex gap-2">
            <input type="hidden" name="view" value={view} />
            <Select
              name="user"
              defaultValue={who}
              aria-label="Whose follow-ups"
              options={[
                { value: "all", label: "Everyone" },
                ...users.map((u) => ({ value: u.id, label: u.full_name })),
              ]}
              placeholder={null}
              className="!h-9 !w-48"
            />
            <button type="submit" className={btn("outline")}>
              Show
            </button>
          </form>
        )}
        <div className="segmented">
          {VIEWS.map(([v, label]) => (
            <Link
              key={v}
              href={href(v)}
              aria-current={v === view ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
      </PageHeader>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold">
          {view === "today"
            ? "Today’s agenda"
            : view === "missed"
              ? "Let’s pick up where you left off"
              : view === "upcoming"
                ? "A little planning goes a long way"
                : "Conversations, followed through"}
        </p>
        <span className="text-xs text-muted">
          {rows.length} follow-ups shown
        </span>
      </div>
      <Card className="overflow-hidden">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        <ul className="divide-y divide-line">
          {rows.map((t) => {
            const lead = t.lead as {
              id: string;
              student_name: string;
              mobile: string;
              stage: { name: string } | null;
            } | null;
            const late =
              t.status === "pending" &&
              new Date(t.due_at as string) < new Date();
            return (
              <li
                key={t.id as string}
                className="flex flex-wrap items-center gap-4 p-5 sm:p-6"
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    late
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "bg-soft text-brand",
                  )}
                >
                  {t.status === "done" ? (
                    <CheckCircle2 size={21} />
                  ) : (
                    <CalendarClock size={21} strokeWidth={1.5} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t.title as string}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {lead && (
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-semibold text-brand"
                      >
                        {lead.student_name}
                      </Link>
                    )}
                    <span>{lead?.stage?.name}</span>
                    <span>
                      {(t.assignee as { full_name: string } | null)
                        ?.full_name ?? "Unassigned"}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-[11px]",
                      late
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-muted",
                    )}
                  >
                    {late ? "Overdue · " : "Scheduled · "}
                    {fmtDateTime(t.due_at as string)}
                  </p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  {lead && (
                    <>
                      <a
                        href={`tel:${lead.mobile}`}
                        className={btn("outline", "h-8")}
                        aria-label={`Call ${lead.student_name}`}
                      >
                        <Phone size={13} />
                        Call
                      </a>
                      <Link
                        href={`/leads/${lead.id}`}
                        className={btn("ghost", "h-8")}
                        aria-label={`Open ${lead.student_name}`}
                      >
                        <ArrowUpRight size={16} />
                      </Link>
                    </>
                  )}
                  {t.status === "pending" ? (
                    <TaskButtons id={t.id as string} />
                  ) : (
                    <span className="text-[11px] text-muted">
                      Completed {fmtDateTime(t.completed_at as string)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {rows.length === 0 && (
          <Empty>
            Nothing here.{" "}
            {view === "today" ? "No follow-ups are due today." : ""}
          </Empty>
        )}
      </Card>
    </>
  );
}
