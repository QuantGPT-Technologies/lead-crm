"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Activity as ActivityIcon,
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  GraduationCap,
  Hash,
  History,
  Mail,
  MapPin,
  MessageSquare,
  MessageSquareText,
  Phone,
  PhoneCall,
  Send,
  Smartphone,
  StickyNote,
  Target,
  User,
  UserCheck,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Badge, Button, Card, Empty, Select, btn } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Activity, Lead, Lookups, Role, Row } from "@/lib/types";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { completeTask, postLead, rechurnLead, updateLead, moveCategory } from "../actions";
import { CATEGORY_OPTIONS } from "@/lib/lead-categories";
import {
  initialValues,
  payload,
  SectionFields,
  type Section,
} from "../lead-fields";
import { ActionPanel, type PanelMode } from "./action-panel";
import { MeetingsPanel } from "./meetings-panel";
import type { LeadMeeting, MeetingConnection } from "@/lib/meeting-types";

type Tab = "overview" | Section | "rechurn";
const TABS: [Tab, string][] = [
  ["overview", "Summary"],
  ["client", "Contact details"],
  ["lead", "Lead details"],
  ["stage", "Qualification"],
  ["location", "Location"],
  ["internals", "Team details"],
  ["professional", "Education & work"],
  ["rechurn", "Re-engage"],
];
const LOWER_TABS = [
  ["info", "Timeline & actions"],
  ["history", "Stage history"],
  ["calls", "Call log"],
  ["meetings", "Meetings"],
  ["posts", "Integrations"],
] as const;
const RAIL: [PanelMode, string, LucideIcon][] = [
  ["email", "Email", Mail],
  ["note", "Note", StickyNote],
  ["task", "Follow-up / Task", ClipboardList],
  ["assign", "Assign", Users],
  ["opportunity", "Opportunity", Target],
  ["sms", "SMS", MessageSquare],
  ["call", "Call", Phone],
  ["enroll", "Enroll", GraduationCap],
  ["whatsapp", "WhatsApp", MessageSquareText],
];
const ACTIVITY_COLOR: Record<string, string> = {
  created: "#285b43",
  stage_change: "#5d8062",
  assigned: "#0ea5e9",
  note: "#d97706",
  call: "#0891b2",
  email: "#285b43",
  sms: "#8a9f6c",
  whatsapp: "#059669",
  task: "#ca8a04",
  rechurn: "#dc2626",
  enrolled: "#16a34a",
  opportunity: "#a68b64",
  post: "#475569",
  meeting_scheduled: "#0284c7",
  meeting_rescheduled: "#7c3aed",
  meeting_completed: "#16a34a",
  meeting_no_show: "#d97706",
  meeting_cancelled: "#64748b",
};

export interface EditorProps {
  lead: Lead;
  lookups: Lookups;
  me: { id: string; name: string; role: Role };
  activities: Activity[];
  calls: Row[];
  tasks: Row[];
  messages: Row[];
  posts: Row[];
  enrollment: Row | null;
  opportunities: Row[];
  prevId: string | null;
  nextId: string | null;
  emailLive: boolean;
  postConfigured: boolean;
  meetings: LeadMeeting[];
  meetingConnection: MeetingConnection;
  meetingTimezone: string;
  meetingNow: string;
}

export function LeadEditor(p: EditorProps) {
  const { lead, lookups, me } = p;
  const isStaff = me.role !== "agent";
  const [tab, setTab] = useState<Tab>("overview");
  const [lower, setLower] = useState<(typeof LOWER_TABS)[number][0]>(p.meetingConnection.notice ? "meetings" : "info");
  const [feed, setFeed] = useState<
    "activity" | "productivity" | "communication"
  >("activity");
  const [mode, setMode] = useState<PanelMode>("call");
  const [pending, start] = useTransition();

  const name = (
    list: { id: string; name?: string; full_name?: string }[],
    id: string | null,
  ) => {
    const hit = list.find((x) => x.id === id);
    return hit?.name ?? hit?.full_name ?? "";
  };
  const stage = lookups.stages.find((s) => s.id === lead.stage_id);
  const rel = (row: Row, key: string) =>
    (row[key] as { full_name?: string } | null)?.full_name ?? "";

  return (
    <div className="space-y-5">
      <Link
        href="/leads"
        className="inline-flex items-center gap-2 text-xs text-muted hover:text-brand"
      >
        <ArrowLeft size={14} /> All leads
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="lead-avatar !h-14 !w-14 !rounded-2xl !text-lg">
            {lead.student_name
              .split(/\s+/)
              .slice(0, 2)
              .map((n) => n[0])
              .join("")}
          </span>
          <div>
            <p className="eyebrow mb-1">{lead.lead_no}</p>
            <h1 className="text-[28px] font-semibold">{lead.student_name}</h1>
            <p className="mt-1 text-xs text-muted">
              {name(lookups.courses, lead.course_id) ||
                "Exploring possibilities"}{" "}
              · {name(lookups.users, lead.owner_id) || "Unassigned"}
            </p>
          </div>
        </div>
        <Badge color={stage?.color}>{stage?.name ?? "New lead"}</Badge>
          {me.role === "admin" ? (
            <Select
              aria-label="Lead category"
              options={[{ value: "none", label: "Uncategorized" }, ...CATEGORY_OPTIONS]}
              placeholder={null}
              value={lead.category ?? "none"}
              disabled={pending}
              className="!w-44"
              onChange={(e) => start(async () => { notify(await moveCategory([lead.id], e.target.value === "none" ? null : e.target.value)); })}
            />
          ) : <Badge>{lead.category ? `Category ${lead.category}` : "Uncategorized"}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Lead actions">
        <button type="button" aria-pressed={lower === "meetings"} onClick={() => {
          setLower("meetings");
          requestAnimationFrame(() => document.getElementById("lead-meetings")?.scrollIntoView({ block: "start", behavior: "smooth" }));
        }} className={btn(lower === "meetings" ? "primary" : "outline")}>
          <Video size={15} /> Schedule Google Meet
        </button>
        {RAIL.filter(([m]) => m !== "assign" || isStaff).map(
          ([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m && lower === "info"}
              onClick={() => {
                setMode(m);
                setLower("info");
              }}
              className={btn(
                mode === m && lower === "info" ? "primary" : "outline",
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ),
        )}
      </div>
      <div className="min-w-0 space-y-5">
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-1">
            <div className="flex flex-1 flex-wrap gap-1" role="group">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"

                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-semibold",
                    tab === key
                      ? "bg-soft text-brand"
                      : "text-muted hover:text-brand",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <NavArrow id={p.prevId} label="Newer lead" icon={ChevronLeft} />
            <NavArrow id={p.nextId} label="Older lead" icon={ChevronRight} />
          </div>

          <div className="mt-3">
            {tab === "overview" && (
              <div className="grid gap-2 lg:grid-cols-3">
                <InfoCard
                  title="Contact"
                  rows={[
                    [Hash, "", lead.lead_no],
                    [User, "", lead.student_name],
                    [Phone, "", lead.mobile],
                    [Smartphone, "", lead.alt_mobile ?? ""],
                    [Mail, "", lead.email ?? ""],
                  ]}
                />
                <InfoCard
                  title="Relationship"
                  rows={[
                    [CalendarDays, "Created Date", fmtDate(lead.created_at)],
                    [
                      UserCheck,
                      "Lead Owner",
                      name(lookups.users, lead.owner_id) || "Unassigned",
                    ],
                    [
                      Send,
                      "Source Desc",
                      lead.source_desc || name(lookups.sources, lead.source_id),
                    ],
                    [History, "Allot On", fmtDateTime(lead.allotted_at)],
                    [PhoneCall, "Attempts", String(lead.attempt_count)],
                  ]}
                />
                <InfoCard
                  title="Journey"
                  rows={[
                    [
                      Building2,
                      "University",
                      name(lookups.universities, lead.university_id),
                    ],
                    [
                      GraduationCap,
                      "Course",
                      name(lookups.courses, lead.course_id),
                    ],
                    [MapPin, "City", lead.city ?? ""],
                    [
                      ActivityIcon,
                      "Stage Desc",
                      [stage?.name, name(lookups.subStages, lead.sub_stage_id)]
                        .filter(Boolean)
                        .join(" / "),
                    ],
                    [
                      CalendarDays,
                      "Next Followup",
                      fmtDateTime(lead.next_followup_at),
                    ],
                  ]}
                />
              </div>
            )}

            {tab !== "overview" && tab !== "rechurn" && (
              // keyed by section + updated_at so the form resets to saved values after each save
              <SectionForm
                key={tab + lead.updated_at}
                section={tab}
                lead={lead}
                lookups={lookups}
                isStaff={isStaff}
                onCancel={() => setTab("overview")}
              />
            )}

            {tab === "rechurn" && (
              <RechurnForm lead={lead} lookups={lookups} isStaff={isStaff} isAdmin={me.role === "admin"} />
            )}
          </div>
        </Card>

        <div className="flex flex-wrap gap-1" role="group">
          {LOWER_TABS.filter(([key]) => key !== "posts" || me.role === "admin").map(([key, label]) => (
            <button
              key={key}
              type="button"

              aria-pressed={lower === key}
              onClick={() => setLower(key)}
              className={cn(
                "rounded-lg px-4 py-2.5 text-xs font-semibold",
                lower === key
                  ? "bg-card text-brand"
                  : "text-muted hover:text-brand",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {lower === "meetings" && <div id="lead-meetings" className="scroll-mt-24"><MeetingsPanel lead={lead} meetings={p.meetings} connection={p.meetingConnection}
          me={me} timezone={p.meetingTimezone} now={p.meetingNow} /></div>}
        {lower === "info" && (
          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <Card className="p-4">
              <h2 className="mb-3 text-lg font-semibold">
                The conversation so far
              </h2>
              <div className="flex gap-1 border-b border-line" role="group">
                {(["activity", "productivity", "communication"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={feed === f}
                      onClick={() => setFeed(f)}
                      className={cn(
                        "border-b-2 px-3 py-2 text-xs font-semibold capitalize",
                        feed === f
                          ? "border-brand text-brand"
                          : "border-transparent text-muted",
                      )}
                    >
                      {f}
                    </button>
                  ),
                )}
              </div>

              {feed === "activity" && <Timeline items={p.activities} />}

              {feed === "productivity" && (
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label="Call attempts" value={lead.attempt_count} />
                    <Stat
                      label="Connected calls"
                      value={
                        p.calls.filter((c) => c.outcome === "connected").length
                      }
                    />
                    <Stat
                      label="Open follow-ups"
                      value={
                        p.tasks.filter((t) => t.status === "pending").length
                      }
                    />
                  </div>
                  <h3 className="font-bold">Follow-ups &amp; tasks</h3>
                  {p.tasks.length === 0 && <Empty>No follow-ups yet.</Empty>}
                  <ul className="space-y-2">
                    {p.tasks.map((t) => {
                      const open = t.status === "pending";
                      const late =
                        open && new Date(t.due_at as string) < new Date();
                      return (
                        <li
                          key={t.id}
                          className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{t.title as string}</p>
                            <p
                              className={cn(
                                "text-xs",
                                late ? "font-bold text-red-600" : "text-muted",
                              )}
                            >
                              Due {fmtDateTime(t.due_at as string)} ·{" "}
                              {rel(t, "assignee") || "Unassigned"}
                            </p>
                          </div>
                          {open ? (
                            <>
                              <Button
                                variant="success"
                                className="h-8"
                                disabled={pending}
                                onClick={() =>
                                  start(
                                    async () =>
                                      void notify(await completeTask(t.id)),
                                  )
                                }
                              >
                                Done
                              </Button>
                              <Button
                                variant="ghost"
                                className="h-8"
                                disabled={pending}
                                onClick={() =>
                                  start(
                                    async () =>
                                      void notify(
                                        await completeTask(t.id, "cancelled"),
                                      ),
                                  )
                                }
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Badge
                              color={
                                t.status === "done" ? "#16a34a" : "#64748b"
                              }
                            >
                              {t.status as string}
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {feed === "communication" && (
                <ul className="space-y-2 pt-4">
                  {p.messages.length === 0 && <Empty>No messages yet.</Empty>}
                  {p.messages.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-md border border-line p-3"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge color={ACTIVITY_COLOR[m.channel as string]}>
                          {m.channel as string}
                        </Badge>
                        <Badge
                          color={
                            m.status === "sent"
                              ? "#16a34a"
                              : m.status === "failed"
                                ? "#dc2626"
                                : "#64748b"
                          }
                        >
                          {m.status as string}
                        </Badge>
                        <span>to {m.recipient as string}</span>
                        <span className="ml-auto">
                          {rel(m, "sender")} ·{" "}
                          {fmtDateTime(m.created_at as string)}
                        </span>
                      </div>
                      {m.subject ? (
                        <p className="font-bold">{m.subject as string}</p>
                      ) : null}
                      <p className="whitespace-pre-wrap">{m.body as string}</p>
                      {m.error ? (
                        <p className="mt-1 text-xs text-red-600">
                          {m.error as string}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <ActionPanel
              mode={mode}
              lead={lead}
              lookups={lookups}
              me={me}
              enrollment={p.enrollment}
              opportunities={p.opportunities}
              emailLive={p.emailLive}
            />
          </div>
        )}

        {lower === "history" && (
          <DataTable
            empty="No stage or ownership changes yet."
            head={["When", "By", "Event", "Details"]}
            rows={p.activities
              .filter((a) =>
                [
                  "created",
                  "stage_change",
                  "assigned",
                  "rechurn",
                  "enrolled",
                ].includes(a.type),
              )
              .map((a) => [
                fmtDateTime(a.created_at),
                a.actor?.full_name ?? "System",
                a.summary,
                Object.entries(
                  (a.details?.fields as Record<string, string>) ?? {},
                )
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" | "),
              ])}
          />
        )}

        {lower === "calls" && (
          <DataTable
            empty="No calls logged yet. Choose Call above to start a conversation or log an outcome."
            head={["When", "By", "Direction", "Outcome", "Duration", "Notes"]}
            rows={p.calls.map((c) => [
              fmtDateTime(c.called_at as string),
              rel(c, "user"),
              c.direction as string,
              String(c.outcome).replace("_", " "),
              `${Math.floor(Number(c.duration_sec) / 60)}m ${Number(c.duration_sec) % 60}s`,
              (c.notes as string) ?? "",
            ])}
          />
        )}

        {lower === "posts" && (
          <div className="space-y-3">
            <Card className="flex flex-wrap items-center gap-3 p-4">
              <p className="flex-1 text-muted">
                {p.postConfigured
                  ? "Send this lead to the external system configured by your admin (for example a university lead API)."
                  : "No Lead Post URL is configured. An admin can add one in Configuration → Settings."}
              </p>
              <Button
                disabled={pending || !p.postConfigured}
                onClick={() =>
                  start(async () => void notify(await postLead(lead.id)))
                }
              >
                <Send size={15} /> Post lead
              </Button>
            </Card>
            <DataTable
              empty="This lead has not been posted yet."
              head={["When", "By", "Target", "Status", "HTTP", "Response"]}
              rows={p.posts.map((x) => [
                fmtDateTime(x.created_at as string),
                rel(x, "poster"),
                x.target as string,
                x.status as string,
                String(x.http_status ?? ""),
                String(x.response ?? "").slice(0, 160),
              ])}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function NavArrow({
  id,
  label,
  icon: Icon,
}: {
  id: string | null;
  label: string;
  icon: LucideIcon;
}) {
  return id ? (
    <Link
      href={`/leads/${id}`}
      title={label}
      aria-label={label}
      className={btn("outline", "h-8 !px-2")}
    >
      <Icon size={16} />
    </Link>
  ) : (
    <span aria-hidden className={btn("outline", "h-8 !px-2 opacity-40")}>
      <Icon size={16} />
    </span>
  );
}

function InfoCard({
  title,
  rows,
}: {
  title: string;
  rows: [LucideIcon, string, string][];
}) {
  return (
    <div className="space-y-1 rounded-xl bg-soft/60 p-4">
      <h2 className="eyebrow mb-3">{title}</h2>
      {rows.map(([Icon, label, value], i) => (
        <div key={i} className="flex items-center gap-2 py-2 text-[11px]">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">
            <Icon size={13} />
          </span>
          {label && <span className="text-muted">{label}</span>}
          <span
            className={cn(
              "min-w-0 break-words font-semibold",
              label ? "ml-auto text-right" : "",
            )}
          >
            {value || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionForm({
  section,
  lead,
  lookups,
  isStaff,
  onCancel,
}: {
  section: Section;
  lead: Lead;
  lookups: Lookups;
  isStaff: boolean;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(() =>
    initialValues([section], lead, lookups),
  );
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(
          async () =>
            void notify(await updateLead(lead.id, section, payload(values))),
        );
      }}
    >
      <SectionFields
        section={section}
        values={values}
        onChange={setValues}
        lookups={lookups}
        isStaff={isStaff}
      />
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="danger" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RechurnForm({
  lead,
  lookups,
  isStaff,
  isAdmin,
}: {
  lead: Lead;
  lookups: Lookups;
  isStaff: boolean;
  isAdmin: boolean;
}) {
  const [reason, setReason] = useState("");
  const [owner, setOwner] = useState(lead.owner_id ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <Stat label="Times rechurned" value={lead.rechurn_count} />
        <Stat
          label="Last rechurned"
          value={fmtDate(lead.last_rechurned_at) || "Never"}
        />
      </div>
      {isStaff ? (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (notify(await rechurnLead(lead.id, reason, owner || null)))
                setReason("");
            });
          }}
        >
          <label>
            <span className="mb-1 block font-semibold">Reason *</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              className="input"
              placeholder="Why is this lead being recycled?"
            />
          </label>
          <label>
            <span className="mb-1 block font-semibold">New owner</span>
            <Select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              options={lookups.users.map((u) => ({
                value: u.id,
                label: u.full_name,
              }))}
              required={!isAdmin}
              placeholder={isAdmin ? "Unassigned pool" : null}
            />
          </label>
          <Button type="submit" variant="danger" disabled={pending}>
            Rechurn lead
          </Button>
          <p className="text-xs text-muted sm:col-span-3">
            Rechurning moves the lead back to the first stage, resets its
            attempt count, cancels open follow-ups and hands it to the new
            owner. History is kept.
          </p>
        </form>
      ) : (
        <p className="text-muted">
          Only managers and admins can rechurn a lead.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-soft p-3">
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Timeline({ items }: { items: Activity[] }) {
  if (!items.length) return <Empty>No activity yet.</Empty>;
  return (
    <ol className="max-h-[560px] space-y-0 overflow-y-auto border border-t-0 border-line p-4">
      {items.map((a) => {
        const fields =
          (a.details?.fields as Record<string, string> | undefined) ?? {};
        const text = a.details?.text as string | undefined;
        const color = ACTIVITY_COLOR[a.type] ?? "#64748b";
        return (
          <li key={a.id} className="relative flex gap-4 pb-5 last:pb-0">
            <span
              className="absolute left-[15px] top-8 h-full w-px bg-line"
              aria-hidden
            />
            <span
              className="z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: color }}
            >
              <User size={15} />
            </span>
            <div className="min-w-0 flex-1 border-t border-line pt-1.5">
              <p className="font-bold" style={{ color }}>
                {a.summary}
              </p>
              {Object.keys(fields).length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {Object.entries(fields).map(([k, v]) => (
                    <li
                      key={k}
                      className="grid grid-cols-[minmax(110px,160px)_1fr] gap-2"
                    >
                      <span className="font-semibold">• {k}</span>
                      <span className="break-words">{v}</span>
                    </li>
                  ))}
                </ul>
              )}
              {text && (
                <p className="mt-1.5 whitespace-pre-wrap rounded bg-soft p-2">
                  {text}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">
                {fmtDateTime(a.created_at)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DataTable({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="table-grid w-full border-collapse">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="max-w-md truncate" title={String(c)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <Empty>{empty}</Empty>}
    </Card>
  );
}
