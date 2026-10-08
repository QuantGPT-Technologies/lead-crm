"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Activity as ActivityIcon, ArrowLeft, Building2, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, Hash,
  History, Mail, MapPin, MessageSquare, MessageSquareText, Phone, PhoneCall, Send, Smartphone, StickyNote, Target, User, UserCheck,
  Users, type LucideIcon,
} from "lucide-react";
import { Badge, Button, Card, Empty, Select, btn } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Activity, Lead, Lookups, Role, Row } from "@/lib/types";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import { completeTask, postLead, rechurnLead, updateLead } from "../actions";
import { initialValues, payload, SectionFields, type Section } from "../lead-fields";
import { ActionPanel, type PanelMode } from "./action-panel";

type Tab = "overview" | Section | "rechurn";
const TABS: [Tab, string][] = [
  ["overview", "Overview"], ["client", "Client"], ["lead", "Lead"], ["stage", "Stage"], ["location", "Location"],
  ["internals", "Internals"], ["professional", "Professional"], ["rechurn", "Rechurn"],
];
const LOWER_TABS = [["info", "Lead Info"], ["history", "Lead History"], ["calls", "Call History"], ["posts", "Lead Post"]] as const;
const RAIL: [PanelMode, string, LucideIcon, string][] = [
  ["email", "Email", Mail, "bg-brand text-white"],
  ["note", "Note", StickyNote, ""],
  ["task", "Follow-up / Task", ClipboardList, ""],
  ["assign", "Assign", Users, ""],
  ["opportunity", "Opportunity", Target, ""],
  ["sms", "SMS", MessageSquare, ""],
  ["call", "Call", Phone, ""],
  ["enroll", "Enroll", GraduationCap, ""],
  ["whatsapp", "WhatsApp", MessageSquareText, "!border-emerald-600 bg-emerald-600 text-white"],
];
const ACTIVITY_COLOR: Record<string, string> = {
  created: "#16a34a", stage_change: "#6366f1", assigned: "#0ea5e9", note: "#d97706", call: "#0891b2", email: "#4f5bd5",
  sms: "#7c3aed", whatsapp: "#059669", task: "#ca8a04", rechurn: "#dc2626", enrolled: "#16a34a", opportunity: "#c026d3", post: "#475569",
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
}

export function LeadEditor(p: EditorProps) {
  const { lead, lookups, me } = p;
  const isStaff = me.role !== "agent";
  const [tab, setTab] = useState<Tab>("overview");
  const [lower, setLower] = useState<(typeof LOWER_TABS)[number][0]>("info");
  const [feed, setFeed] = useState<"activity" | "productivity" | "communication">("activity");
  const [mode, setMode] = useState<PanelMode>("email");
  const [pending, start] = useTransition();

  const name = (list: { id: string; name?: string; full_name?: string }[], id: string | null) => {
    const hit = list.find((x) => x.id === id);
    return hit?.name ?? hit?.full_name ?? "";
  };
  const stage = lookups.stages.find((s) => s.id === lead.stage_id);
  const rel = (row: Row, key: string) => ((row[key] as { full_name?: string } | null)?.full_name ?? "");

  return (
    <div className="flex gap-3">
      <div className="min-w-0 flex-1 space-y-3">
        <Card className="relative p-3 pt-5">
          <span className="absolute -left-1 -top-2 rounded bg-amber-400 px-3 py-0.5 text-sm font-extrabold text-black shadow">Edit Lead</span>
          <div className="flex flex-wrap items-center gap-1">
            <div className="flex flex-1 flex-wrap gap-1" role="tablist">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn("rounded-t-md border-b-2 px-3.5 py-2 font-semibold", tab === key ? "border-brand text-red-500" : "border-transparent hover:text-brand")}
                >
                  {label}
                </button>
              ))}
            </div>
            <Link href="/leads" className={btn("primary", "h-8")}>
              <ArrowLeft size={14} /> Back
            </Link>
            <NavArrow id={p.prevId} label="Newer lead" icon={ChevronLeft} />
            <NavArrow id={p.nextId} label="Older lead" icon={ChevronRight} />
          </div>

          <div className="mt-3">
            {tab === "overview" && (
              <div className="grid gap-2 lg:grid-cols-3">
                <InfoCard
                  gradient="linear-gradient(135deg,#e85de0,#a05cf0)"
                  rows={[[Hash, "", lead.lead_no], [User, "", lead.student_name], [Phone, "", lead.mobile], [Smartphone, "", lead.alt_mobile ?? ""], [Mail, "", lead.email ?? ""]]}
                />
                <InfoCard
                  gradient="linear-gradient(135deg,#7c6cf5,#9d4edd)"
                  rows={[
                    [CalendarDays, "Created Date", fmtDate(lead.created_at)],
                    [UserCheck, "Lead Owner", name(lookups.users, lead.owner_id) || "Unassigned"],
                    [Send, "Source Desc", lead.source_desc || name(lookups.sources, lead.source_id)],
                    [History, "Allot On", fmtDateTime(lead.allotted_at)],
                    [PhoneCall, "Attempts", String(lead.attempt_count)],
                  ]}
                />
                <InfoCard
                  gradient="linear-gradient(135deg,#38bdf8,#22d3ee)"
                  rows={[
                    [Building2, "University", name(lookups.universities, lead.university_id)],
                    [GraduationCap, "Course", name(lookups.courses, lead.course_id)],
                    [MapPin, "City", lead.city ?? ""],
                    [ActivityIcon, "Stage Desc", [stage?.name, name(lookups.subStages, lead.sub_stage_id)].filter(Boolean).join(" / ")],
                    [CalendarDays, "Next Followup", fmtDateTime(lead.next_followup_at)],
                  ]}
                />
              </div>
            )}

            {tab !== "overview" && tab !== "rechurn" && (
              // keyed by section + updated_at so the form resets to saved values after each save
              <SectionForm key={tab + lead.updated_at} section={tab} lead={lead} lookups={lookups} isStaff={isStaff} onCancel={() => setTab("overview")} />
            )}

            {tab === "rechurn" && <RechurnForm lead={lead} lookups={lookups} isStaff={isStaff} />}
          </div>
        </Card>

        <div className="flex flex-wrap gap-1" role="tablist">
          {LOWER_TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={lower === key}
              onClick={() => setLower(key)}
              className={cn("rounded-t-md border-t-2 px-6 py-2.5 font-bold", lower === key ? "border-brand bg-card text-brand" : "border-transparent")}
            >
              {label}
            </button>
          ))}
        </div>

        {lower === "info" && (
          <div className="grid gap-3 xl:grid-cols-[3fr_2fr]">
            <Card className="p-4">
              <h2 className="mb-3 text-lg font-bold">History</h2>
              <div className="flex gap-1 border-b border-line" role="tablist">
                {(["activity", "productivity", "communication"] as const).map((f) => (
                  <button key={f} type="button" role="tab" aria-selected={feed === f} onClick={() => setFeed(f)} className={cn("-mb-px border border-b-0 px-4 py-2 font-semibold capitalize", feed === f ? "rounded-t-md border-line bg-card text-red-500" : "border-transparent")}>
                    {f}
                  </button>
                ))}
              </div>

              {feed === "activity" && <Timeline items={p.activities} />}

              {feed === "productivity" && (
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label="Call attempts" value={lead.attempt_count} />
                    <Stat label="Connected calls" value={p.calls.filter((c) => c.outcome === "connected").length} />
                    <Stat label="Open follow-ups" value={p.tasks.filter((t) => t.status === "pending").length} />
                  </div>
                  <h3 className="font-bold">Follow-ups &amp; tasks</h3>
                  {p.tasks.length === 0 && <Empty>No follow-ups yet.</Empty>}
                  <ul className="space-y-2">
                    {p.tasks.map((t) => {
                      const open = t.status === "pending";
                      const late = open && new Date(t.due_at as string) < new Date();
                      return (
                        <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{t.title as string}</p>
                            <p className={cn("text-xs", late ? "font-bold text-red-600" : "text-muted")}>
                              Due {fmtDateTime(t.due_at as string)} · {rel(t, "assignee") || "Unassigned"}
                            </p>
                          </div>
                          {open ? (
                            <>
                              <Button variant="success" className="h-8" disabled={pending} onClick={() => start(async () => void notify(await completeTask(t.id)))}>
                                Done
                              </Button>
                              <Button variant="ghost" className="h-8" disabled={pending} onClick={() => start(async () => void notify(await completeTask(t.id, "cancelled")))}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Badge color={t.status === "done" ? "#16a34a" : "#64748b"}>{t.status as string}</Badge>
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
                    <li key={m.id} className="rounded-md border border-line p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <Badge color={ACTIVITY_COLOR[m.channel as string]}>{m.channel as string}</Badge>
                        <Badge color={m.status === "sent" ? "#16a34a" : m.status === "failed" ? "#dc2626" : "#64748b"}>{m.status as string}</Badge>
                        <span>to {m.recipient as string}</span>
                        <span className="ml-auto">{rel(m, "sender")} · {fmtDateTime(m.created_at as string)}</span>
                      </div>
                      {m.subject ? <p className="font-bold">{m.subject as string}</p> : null}
                      <p className="whitespace-pre-wrap">{m.body as string}</p>
                      {m.error ? <p className="mt-1 text-xs text-red-600">{m.error as string}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <ActionPanel mode={mode} lead={lead} lookups={lookups} me={me} enrollment={p.enrollment} opportunities={p.opportunities} emailLive={p.emailLive} />
          </div>
        )}

        {lower === "history" && (
          <DataTable
            empty="No stage or ownership changes yet."
            head={["When", "By", "Event", "Details"]}
            rows={p.activities
              .filter((a) => ["created", "stage_change", "assigned", "rechurn", "enrolled"].includes(a.type))
              .map((a) => [fmtDateTime(a.created_at), a.actor?.full_name ?? "System", a.summary, Object.entries((a.details?.fields as Record<string, string>) ?? {}).map(([k, v]) => `${k}: ${v}`).join(" | ")])}
          />
        )}

        {lower === "calls" && (
          <DataTable
            empty="No calls logged yet. Use the phone icon on the right to log one."
            head={["When", "By", "Direction", "Outcome", "Duration", "Notes"]}
            rows={p.calls.map((c) => [fmtDateTime(c.called_at as string), rel(c, "user"), c.direction as string, String(c.outcome).replace("_", " "), `${Math.floor(Number(c.duration_sec) / 60)}m ${Number(c.duration_sec) % 60}s`, (c.notes as string) ?? ""])}
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
              <Button disabled={pending || !p.postConfigured} onClick={() => start(async () => void notify(await postLead(lead.id)))}>
                <Send size={15} /> Post lead
              </Button>
            </Card>
            <DataTable
              empty="This lead has not been posted yet."
              head={["When", "By", "Target", "Status", "HTTP", "Response"]}
              rows={p.posts.map((x) => [fmtDateTime(x.created_at as string), rel(x, "poster"), x.target as string, x.status as string, String(x.http_status ?? ""), String(x.response ?? "").slice(0, 160)])}
            />
          </div>
        )}
      </div>

      <div className="flex w-11 shrink-0 flex-col gap-2 pt-1">
        {RAIL.filter(([m]) => m !== "assign" || isStaff).map(([m, label, Icon, cls]) => (
          <button
            key={m}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={mode === m && lower === "info"}
            onClick={() => {
              setMode(m);
              setLower("info");
            }}
            className={cn("flex h-10 w-10 items-center justify-center rounded-md border border-brand text-brand shadow-sm hover:brightness-95", cls, mode === m && lower === "info" && "ring-2 ring-amber-400")}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}

function NavArrow({ id, label, icon: Icon }: { id: string | null; label: string; icon: LucideIcon }) {
  return id ? (
    <Link href={`/leads/${id}`} title={label} aria-label={label} className={btn("primary", "h-8 !px-2")}>
      <Icon size={16} />
    </Link>
  ) : (
    <span aria-hidden className={btn("primary", "h-8 !px-2 opacity-40")}>
      <Icon size={16} />
    </span>
  );
}

function InfoCard({ gradient, rows }: { gradient: string; rows: [LucideIcon, string, string][] }) {
  return (
    <div className="space-y-1.5 rounded-md p-2 text-white" style={{ background: gradient }}>
      {rows.map(([Icon, label, value], i) => (
        <div key={i} className="flex items-center gap-3 rounded bg-white/15 px-3 py-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/70">
            <Icon size={13} />
          </span>
          {label && <span className="font-semibold">{label}</span>}
          <span className={cn("min-w-0 break-words font-bold", label ? "ml-auto text-right" : "")}>{value || "—"}</span>
        </div>
      ))}
    </div>
  );
}

function SectionForm({ section, lead, lookups, isStaff, onCancel }: { section: Section; lead: Lead; lookups: Lookups; isStaff: boolean; onCancel: () => void }) {
  const [values, setValues] = useState(() => initialValues([section], lead, lookups));
  const [pending, start] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => void notify(await updateLead(lead.id, section, payload(values))));
      }}
    >
      <SectionFields section={section} values={values} onChange={setValues} lookups={lookups} isStaff={isStaff} />
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Submit"}
        </Button>
        <Button variant="danger" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function RechurnForm({ lead, lookups, isStaff }: { lead: Lead; lookups: Lookups; isStaff: boolean }) {
  const [reason, setReason] = useState("");
  const [owner, setOwner] = useState(lead.owner_id ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <Stat label="Times rechurned" value={lead.rechurn_count} />
        <Stat label="Last rechurned" value={fmtDate(lead.last_rechurned_at) || "Never"} />
      </div>
      {isStaff ? (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              if (notify(await rechurnLead(lead.id, reason, owner || null))) setReason("");
            });
          }}
        >
          <label>
            <span className="mb-1 block font-semibold">Reason *</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} className="input" placeholder="Why is this lead being recycled?" />
          </label>
          <label>
            <span className="mb-1 block font-semibold">New owner</span>
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} options={lookups.users.map((u) => ({ value: u.id, label: u.full_name }))} placeholder="Unassigned pool" />
          </label>
          <Button type="submit" variant="danger" disabled={pending}>
            Rechurn lead
          </Button>
          <p className="text-xs text-muted sm:col-span-3">
            Rechurning moves the lead back to the first stage, resets its attempt count, cancels open follow-ups and hands it to the new owner. History is kept.
          </p>
        </form>
      ) : (
        <p className="text-muted">Only managers and admins can rechurn a lead.</p>
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
        const fields = (a.details?.fields as Record<string, string> | undefined) ?? {};
        const text = a.details?.text as string | undefined;
        const color = ACTIVITY_COLOR[a.type] ?? "#64748b";
        return (
          <li key={a.id} className="relative flex gap-4 pb-5 last:pb-0">
            <span className="absolute left-[15px] top-8 h-full w-px bg-line" aria-hidden />
            <span className="z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
              <User size={15} />
            </span>
            <div className="min-w-0 flex-1 border-t border-line pt-1.5">
              <p className="font-bold" style={{ color }}>{a.summary}</p>
              {Object.keys(fields).length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {Object.entries(fields).map(([k, v]) => (
                    <li key={k} className="grid grid-cols-[minmax(110px,160px)_1fr] gap-2">
                      <span className="font-semibold">• {k}</span>
                      <span className="break-words">{v}</span>
                    </li>
                  ))}
                </ul>
              )}
              {text && <p className="mt-1.5 whitespace-pre-wrap rounded bg-soft p-2">{text}</p>}
              <p className="mt-1 text-xs text-muted">{fmtDateTime(a.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DataTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  return (
    <Card className="overflow-x-auto">
      <table className="table-grid w-full border-collapse">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="max-w-md truncate" title={String(c)}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <Empty>{empty}</Empty>}
    </Card>
  );
}

