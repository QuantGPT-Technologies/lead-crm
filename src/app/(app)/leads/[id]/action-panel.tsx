"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ExternalLink } from "lucide-react";
import { Badge, Button, Card, Field, Select, btn } from "@/components/ui";
import { notify, toast } from "@/components/toast";
import type { ActionResult, Lead, Lookups, Role, Row } from "@/lib/types";
import { fmtDate, fmtMoney, renderTemplate, tzDateString } from "@/lib/utils";
import { addNote, addTask, assignLeads, enrollLead, logCall, saveOpportunity, sendMessage } from "../actions";

export type PanelMode = "email" | "note" | "task" | "assign" | "opportunity" | "sms" | "call" | "enroll" | "whatsapp";

const TITLES: Record<PanelMode, string> = {
  email: "Email", note: "Note", task: "Follow-up / Task", assign: "Assign Lead", opportunity: "Opportunity", sms: "SMS",
  call: "Log Call", enroll: "Enrolment", whatsapp: "WhatsApp",
};
const OUTCOMES = [
  ["connected", "Connected"], ["no_answer", "Ringing - no answer"], ["busy", "Busy"], ["switched_off", "Switched off"],
  ["callback", "Asked to call back"], ["wrong_number", "Wrong number"],
].map(([value, label]) => ({ value, label }));

/** International number for wa.me links; 10-digit numbers are assumed to be Indian. */
const intl = (mobile: string) => (mobile.length === 10 ? `91${mobile}` : mobile);

interface Props {
  mode: PanelMode;
  lead: Lead;
  lookups: Lookups;
  me: { id: string; name: string; role: Role };
  enrollment: Row | null;
  opportunities: Row[];
  emailLive: boolean;
}

export function ActionPanel(props: Props) {
  const { mode, lead } = props;
  return (
    <Card className="self-start p-4">
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
        <h2 className="text-lg font-bold">{TITLES[mode]}</h2>
        {lead.dnd && <Badge color="#dc2626">Do Not Disturb</Badge>}
      </div>
      {/* keyed so switching action always starts from a clean form */}
      <PanelBody key={mode} {...props} />
    </Card>
  );
}

function PanelBody({ mode, lead, lookups, me, enrollment, opportunities, emailLive }: Props) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ href: string; label: string } | null>(null);
  const isStaff = me.role !== "agent";

  /** Runs a server action from a form and clears the form when it worked. */
  const submit = (fn: (f: FormData) => Promise<ActionResult>, okText?: string) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    start(async () => {
      if (notify(await fn(new FormData(form)), okText)) form.reset();
    });
  };
  const str = (f: FormData, k: string) => String(f.get(k) ?? "");
  const iso = (v: string) => (v ? new Date(v).toISOString() : "");
  const save = (label: string) => (
    <Button type="submit" disabled={pending}>
      {pending ? "Please wait..." : label}
    </Button>
  );

  if (mode === "email" || mode === "sms" || mode === "whatsapp") {
    return <Compose channel={mode} lead={lead} lookups={lookups} agent={me.name} emailLive={emailLive} link={link} setLink={setLink} />;
  }

  if (mode === "note") {
    return (
      <form className="space-y-3" onSubmit={submit((f) => addNote(lead.id, str(f, "text")))}>
        <textarea name="text" required rows={6} maxLength={4000} placeholder="Write a note about this lead..." aria-label="Note" className="input" />
        {save("Add note")}
      </form>
    );
  }

  if (mode === "task") {
    return (
      <form className="space-y-3" onSubmit={submit((f) => addTask(lead.id, { title: str(f, "title"), due_at: iso(str(f, "due_at")), assigned_to: str(f, "assigned_to") }))}>
        <Field label="Title" required>
          <input name="title" required defaultValue="Follow up call" className="input" />
        </Field>
        <Field label="Due" required>
          <input name="due_at" type="datetime-local" required className="input" />
        </Field>
        {isStaff && (
          <Field label="Assign to">
            <Select name="assigned_to" defaultValue={lead.owner_id ?? me.id} options={lookups.users.map((u) => ({ value: u.id, label: u.full_name }))} placeholder={null} />
          </Field>
        )}
        {save("Schedule")}
      </form>
    );
  }

  if (mode === "assign") {
    return (
      <form className="space-y-3" onSubmit={submit((f) => assignLeads([lead.id], str(f, "owner") || null))}>
        <Field label="Lead owner">
          <Select name="owner" defaultValue={lead.owner_id ?? ""} options={lookups.users.map((u) => ({ value: u.id, label: `${u.full_name} (${u.emp_code})` }))} placeholder="Unassigned pool" />
        </Field>
        {save("Assign")}
      </form>
    );
  }

  if (mode === "call") {
    return (
      <form
        className="space-y-3"
        onSubmit={submit((f) =>
          logCall(lead.id, {
            outcome: str(f, "outcome"),
            direction: str(f, "direction"),
            duration_sec: Number(str(f, "min")) * 60 + Number(str(f, "sec")),
            notes: str(f, "notes"),
            followup_at: iso(str(f, "followup_at")),
          }),
        )}
      >
        <a href={`tel:${lead.mobile}`} className={btn("success", "w-full")}>
          Dial {lead.mobile}
        </a>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Outcome" required>
            <Select name="outcome" required options={OUTCOMES} />
          </Field>
          <Field label="Direction">
            <Select name="direction" options={[{ value: "outbound", label: "Outbound" }, { value: "inbound", label: "Inbound" }]} placeholder={null} />
          </Field>
          <Field label="Minutes">
            <input name="min" type="number" min={0} max={600} defaultValue={0} className="input" />
          </Field>
          <Field label="Seconds">
            <input name="sec" type="number" min={0} max={59} defaultValue={0} className="input" />
          </Field>
        </div>
        <Field label="Notes">
          <textarea name="notes" rows={3} className="input" />
        </Field>
        <Field label="Next follow-up (optional)">
          <input name="followup_at" type="datetime-local" className="input" />
        </Field>
        {save("Log call")}
      </form>
    );
  }

  if (mode === "enroll") {
    return <EnrollForm lead={lead} lookups={lookups} enrollment={enrollment} />;
  }

  // opportunity
  return (
    <div className="space-y-4">
      {opportunities.map((o) => (
        <div key={o.id} className="flex items-center gap-2 rounded-md border border-line p-2.5">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{o.title as string}</p>
            <p className="text-xs text-muted">
              {fmtMoney(o.amount as number)} · {o.probability as number}% · closes {fmtDate(o.expected_close as string) || "n/a"}
            </p>
          </div>
          <Select
            aria-label="Opportunity status"
            value={o.status as string}
            disabled={pending}
            placeholder={null}
            className="!h-8 !w-24"
            options={["open", "won", "lost"].map((s) => ({ value: s, label: s }))}
            onChange={(e) =>
              start(async () =>
                void notify(
                  await saveOpportunity(lead.id, { id: o.id, title: o.title as string, amount: Number(o.amount), probability: Number(o.probability), expected_close: (o.expected_close as string) ?? "", notes: (o.notes as string) ?? "", status: e.target.value }),
                ),
              )
            }
          />
        </div>
      ))}
      <form
        className="space-y-3"
        onSubmit={submit((f) => saveOpportunity(lead.id, { title: str(f, "title"), amount: Number(str(f, "amount")), probability: Number(str(f, "probability")), expected_close: str(f, "expected_close"), notes: str(f, "notes") }))}
      >
        <Field label="Title" required>
          <input name="title" required className="input" placeholder="e.g. MBA admission - July intake" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amount" required>
            <input name="amount" type="number" min={0} step="0.01" required className="input" />
          </Field>
          <Field label="Probability %">
            <input name="probability" type="number" min={0} max={100} defaultValue={50} className="input" />
          </Field>
          <Field label="Expected close">
            <input name="expected_close" type="date" className="input" />
          </Field>
        </div>
        <Field label="Notes">
          <textarea name="notes" rows={2} className="input" />
        </Field>
        {save("Add opportunity")}
      </form>
    </div>
  );
}

function Compose({
  channel,
  lead,
  lookups,
  agent,
  emailLive,
  link,
  setLink,
}: {
  channel: "email" | "sms" | "whatsapp";
  lead: Lead;
  lookups: Lookups;
  agent: string;
  emailLive: boolean;
  link: { href: string; label: string } | null;
  setLink: (l: { href: string; label: string } | null) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const templates = lookups.templates.filter((t) => t.channel === channel);
  const vars = {
    name: lead.student_name,
    agent,
    course: lookups.courses.find((c) => c.id === lead.course_id)?.name ?? "the course",
    university: lookups.universities.find((u) => u.id === lead.university_id)?.name ?? "the university",
    mobile: lead.mobile,
  };
  const target = channel === "email" ? lead.email : lead.mobile;

  function send(e: FormEvent) {
    e.preventDefault();
    setLink(null);
    start(async () => {
      const res = await sendMessage(lead.id, { channel, subject, body });
      if (res.error) return toast(res.error, "error");
      if (res.message === "logged") {
        // No server-side provider for this channel: hand the message to the app on this device.
        const text = encodeURIComponent(body);
        setLink(
          channel === "email"
            ? { href: `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${text}`, label: "Open in mail app to send" }
            : channel === "sms"
              ? { href: `sms:${lead.mobile}?body=${text}`, label: "Open in SMS app to send" }
              : { href: `https://wa.me/${intl(lead.mobile)}?text=${text}`, label: "Open in WhatsApp to send" },
        );
        toast("Saved to message log");
      } else {
        toast(res.message ?? "Sent");
      }
      setSubject("");
      setBody("");
    });
  }

  return (
    <form className="space-y-3" onSubmit={send}>
      <p className="text-sm text-muted">
        To: <span className="font-semibold text-fg">{target || `no ${channel === "email" ? "email" : "mobile"} on this lead`}</span>
      </p>
      {templates.length > 0 && (
        <Select
          aria-label="Use a template"
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          placeholder="Use a template..."
          value=""
          onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value);
            if (!t) return;
            setSubject(renderTemplate(t.subject ?? "", vars));
            setBody(renderTemplate(t.body, vars));
          }}
        />
      )}
      {channel === "email" && <input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Subject" aria-label="Subject" className="input" />}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={7} maxLength={channel === "sms" ? 600 : 5000} placeholder="Message" aria-label="Message" className="input" />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !target || lead.dnd}>
          {pending ? "Please wait..." : channel === "email" && emailLive ? "Send email" : "Save & continue"}
        </Button>
        {link && (
          <a href={link.href} target="_blank" rel="noopener noreferrer" className={btn("success")}>
            <ExternalLink size={15} /> {link.label}
          </a>
        )}
      </div>
      {!(channel === "email" && emailLive) && (
        <p className="text-xs text-muted">
          The message is saved to this lead&apos;s history, then you send it from your own {channel === "email" ? "mail app" : channel === "sms" ? "SMS app" : "WhatsApp"}.
        </p>
      )}
    </form>
  );
}

function EnrollForm({ lead, lookups, enrollment }: { lead: Lead; lookups: Lookups; enrollment: Row | null }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState({
    university_id: String(enrollment?.university_id ?? lead.university_id ?? ""),
    course_id: String(enrollment?.course_id ?? lead.course_id ?? ""),
    fee_amount: String(enrollment?.fee_amount ?? ""),
    paid_amount: String(enrollment?.paid_amount ?? "0"),
    enrolled_on: String(enrollment?.enrolled_on ?? tzDateString()),
    enrollment_no: String(enrollment?.enrollment_no ?? ""),
    notes: String(enrollment?.notes ?? ""),
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((old) => ({ ...old, [k]: e.target.value }));
  const courses = lookups.courses.filter((c) => c.university_id === v.university_id);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => void notify(await enrollLead(lead.id, { ...v, fee_amount: Number(v.fee_amount), paid_amount: Number(v.paid_amount) })));
      }}
    >
      {enrollment && <Badge color="#16a34a">Enrolled on {fmtDate(String(enrollment.enrolled_on))}</Badge>}
      <Field label="University" required>
        <Select
          required
          value={v.university_id}
          options={lookups.universities.map((u) => ({ value: u.id, label: u.name }))}
          onChange={(e) => setV((old) => ({ ...old, university_id: e.target.value, course_id: "" }))}
        />
      </Field>
      <Field label="Course" required>
        <Select
          required
          value={v.course_id}
          options={courses.map((c) => ({ value: c.id, label: c.name }))}
          onChange={(e) => {
            const fee = courses.find((c) => c.id === e.target.value)?.fee;
            setV((old) => ({ ...old, course_id: e.target.value, fee_amount: old.fee_amount || (fee != null ? String(fee) : "") }));
          }}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Total fee" required>
          <input type="number" min={0} step="0.01" required value={v.fee_amount} onChange={set("fee_amount")} className="input" />
        </Field>
        <Field label="Paid so far" required>
          <input type="number" min={0} step="0.01" required value={v.paid_amount} onChange={set("paid_amount")} className="input" />
        </Field>
        <Field label="Enrolment date" required>
          <input type="date" required value={v.enrolled_on} onChange={set("enrolled_on")} className="input" />
        </Field>
        <Field label="Enrolment no.">
          <input value={v.enrollment_no} onChange={set("enrollment_no")} className="input" />
        </Field>
      </div>
      <Field label="Notes">
        <textarea rows={2} value={v.notes} onChange={set("notes")} className="input" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Please wait..." : enrollment ? "Update enrolment" : "Mark as enrolled"}
      </Button>
    </form>
  );
}
