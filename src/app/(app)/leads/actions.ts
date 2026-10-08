"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession, isStaff } from "@/lib/auth";
import { chunk, getLookups, getSetting, logActivity } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/server";
import { deliver } from "@/lib/messaging";
import type { ActionResult, Lead, Lookups } from "@/lib/types";
import { isValidEmail, isValidMobile, normalizeMobile } from "@/lib/utils";

type Values = Record<string, unknown>;

const SECTIONS = {
  client: ["student_name", "mobile", "alt_mobile", "email", "gender", "dob", "dnd"],
  lead: ["source_id", "source_desc", "campaign", "medium", "product", "priority"],
  stage: ["university_id", "course_id", "stage_id", "sub_stage_id", "remarks"],
  location: ["country", "state", "city", "pincode", "address"],
  internals: ["internal_notes", "owner_id"],
  professional: ["qualification", "company", "designation", "experience_years"],
} as const;
export type LeadSection = keyof typeof SECTIONS;

const LABELS: Record<string, string> = {
  student_name: "Student Name", mobile: "Mobile", alt_mobile: "Alternate Mobile", email: "Email", gender: "Gender",
  dob: "Date of Birth", dnd: "Do Not Disturb", source_id: "Source", source_desc: "Source Desc", campaign: "Campaign",
  medium: "Medium", product: "Product", priority: "Priority", university_id: "University", course_id: "Course",
  stage_id: "Stage", sub_stage_id: "Sub Stage", remarks: "Remarks", country: "Country", state: "State", city: "City",
  pincode: "Pincode", address: "Address", internal_notes: "Internal Notes", owner_id: "Lead Owner",
  qualification: "Qualification", company: "Company", designation: "Designation", experience_years: "Experience (years)",
};

const done = (res: ActionResult = {}) => {
  revalidatePath("/", "layout");
  return res;
};

/** Picks allowed fields and normalises blanks to null. */
function clean(values: Values, fields: readonly string[]) {
  const out: Values = {};
  for (const f of fields) {
    if (!(f in values)) continue;
    let v = values[f];
    if (typeof v === "string") v = v.trim();
    if (f === "dnd") v = v === true || v === "true";
    else if (v === "" || v === undefined) v = null;
    else if (f === "experience_years") v = Number(v);
    else if (f === "mobile" || f === "alt_mobile") v = normalizeMobile(v);
    else if (f === "email") v = String(v).toLowerCase();
    out[f] = v;
  }
  return out;
}

function validate(v: Values): string | null {
  if ("student_name" in v && String(v.student_name ?? "").length < 2) return "Student name is required";
  if ("mobile" in v && !isValidMobile(String(v.mobile ?? ""))) return "Enter a valid mobile number";
  if (v.alt_mobile && !isValidMobile(String(v.alt_mobile))) return "Alternate mobile is not valid";
  if (v.email && !isValidEmail(String(v.email))) return "Email is not valid";
  if (v.experience_years != null && (Number.isNaN(v.experience_years) || Number(v.experience_years) < 0 || Number(v.experience_years) > 60))
    return "Experience must be between 0 and 60 years";
  if (v.dob && new Date(String(v.dob)) > new Date()) return "Date of birth cannot be in the future";
  return null;
}

/** Turns an id into the name people see, for activity history. */
function display(field: string, value: unknown, lk: Lookups): string {
  if (value == null || value === "") return "N/A";
  const find = (list: { id: string; name?: string; full_name?: string }[]) => {
    const hit = list.find((x) => x.id === value);
    return hit?.name ?? hit?.full_name ?? "N/A";
  };
  switch (field) {
    case "source_id": return find(lk.sources);
    case "university_id": return find(lk.universities);
    case "course_id": return find(lk.courses);
    case "stage_id": return find(lk.stages);
    case "sub_stage_id": return find(lk.subStages);
    case "owner_id": return find(lk.users);
    case "dnd": return value ? "Yes" : "No";
    default: return String(value);
  }
}

const dbError = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "A lead with this mobile number already exists" : e.code === "42501" ? "You do not have permission to do this" : e.message;

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const idList = z.array(z.uuid()).min(1, "Select at least one lead").max(150, "Select at most 150 leads at a time");

// ------------------------------------------------------------------ leads ---

export async function createLead(values: Values): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const lk = await getLookups();
  const all = Object.values(SECTIONS).flat();
  const row = clean(values, all);
  const problem = validate({ student_name: "", mobile: "", ...row });
  if (problem) return { error: problem };

  if (!isStaff(profile.role)) row.owner_id = profile.id; // agents always own the leads they add
  row.stage_id ??= lk.stages[0]?.id ?? null;
  if (row.owner_id) row.allotted_at = new Date().toISOString();
  row.created_by = profile.id;

  const { data, error } = await supabase.from("leads").insert(row).select("id, student_name").single();
  if (error) return { error: dbError(error) };

  await logActivity(supabase, [
    {
      lead_id: data.id,
      actor_id: profile.id,
      type: "created",
      summary: `${profile.full_name} created the Lead ${data.student_name} with following details`,
      details: { fields: { "Do Not Disturb": row.dnd ? "Yes" : "N/A", Source: display("source_id", row.source_id, lk), Stage: display("stage_id", row.stage_id, lk), "Lead Owner": display("owner_id", row.owner_id, lk) } },
    },
  ]);
  return done({ id: data.id });
}

export async function updateLead(id: string, section: LeadSection, values: Values): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const lk = await getLookups();
  let fields: readonly string[] = SECTIONS[section];
  if (!fields) return { error: "Unknown section" };
  if (section === "internals" && !isStaff(profile.role)) fields = ["internal_notes"];

  const patch = clean(values, fields);
  const problem = validate(patch);
  if (problem) return { error: problem };

  if (section === "stage") {
    if (!patch.university_id) return { error: "University is required" };
    if (!patch.course_id) return { error: "Course is required" };
    if (!patch.stage_id) return { error: "Stage is required" };
    const subs = lk.subStages.filter((s) => s.stage_id === patch.stage_id);
    if (subs.length && !subs.some((s) => s.id === patch.sub_stage_id)) return { error: "Sub Stage is required" };
    if (!subs.length) patch.sub_stage_id = null;
    if (!lk.courses.some((c) => c.id === patch.course_id && c.university_id === patch.university_id))
      return { error: "Selected course does not belong to the selected university" };
  }

  const { data: before } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!before) return { error: "Lead not found" };
  const lead = before as Lead & Values;

  const changes: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    const old = (lead as Values)[k] ?? null;
    if (String(old ?? "") === String(v ?? "")) delete patch[k];
    else changes[LABELS[k] ?? k] = `${display(k, old, lk)} → ${display(k, v, lk)}`;
  }
  if (!Object.keys(patch).length) return { message: "No changes to save" };
  if ("owner_id" in patch) patch.allotted_at = patch.owner_id ? new Date().toISOString() : null;

  // An owner change can move the lead out of a manager's view, which RLS would reject; the
  // caller is staff and has already read the lead, so that one write uses the service role.
  const db = "owner_id" in patch ? createAdminClient() : supabase;
  const { error } = await db.from("leads").update(patch).eq("id", id);
  if (error) return { error: dbError(error) };

  const stageChanged = "stage_id" in patch;
  await logActivity(supabase, [
    {
      lead_id: id,
      actor_id: profile.id,
      type: stageChanged ? "stage_change" : "owner_id" in patch ? "assigned" : "updated",
      summary: stageChanged
        ? `${profile.full_name} moved ${lead.student_name} to ${display("stage_id", patch.stage_id, lk)}`
        : `${profile.full_name} updated ${section} details of ${lead.student_name}`,
      details: { fields: changes },
    },
  ]);
  return done();
}

export async function moveStage(id: string, stageId: string): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const lk = await getLookups();
  const stage = lk.stages.find((s) => s.id === stageId);
  if (!stage) return { error: "Unknown stage" };
  const { data: lead } = await supabase.from("leads").select("student_name, stage_id").eq("id", id).maybeSingle();
  if (!lead) return { error: "Lead not found" };
  if (lead.stage_id === stageId) return {};

  const { error } = await supabase.from("leads").update({ stage_id: stageId, sub_stage_id: null }).eq("id", id);
  if (error) return { error: dbError(error) };
  await logActivity(supabase, [
    {
      lead_id: id,
      actor_id: profile.id,
      type: "stage_change",
      summary: `${profile.full_name} moved ${lead.student_name} to ${stage.name}`,
      details: { fields: { Stage: `${display("stage_id", lead.stage_id, lk)} → ${stage.name}` } },
    },
  ]);
  return done();
}

export async function assignLeads(ids: string[], ownerId: string | null): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  if (!isStaff(profile.role)) return { error: "Only managers and admins can assign leads" };
  const parsed = idList.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const lk = await getLookups();
  if (ownerId && !lk.users.some((u) => u.id === ownerId)) return { error: "Unknown user" };

  // Only leads the caller can see are touched; the write itself uses the service role because
  // the new owner may be outside the caller's team (the row would fail RLS on the way back).
  const admin = createAdminClient();
  const allotted_at = ownerId ? new Date().toISOString() : null;
  const assigned: string[] = [];
  for (const part of chunk(parsed.data, 150)) {
    const { data: visible, error } = await supabase.from("leads").select("id").in("id", part);
    if (error) return { error: dbError(error) };
    const visibleIds = (visible ?? []).map((l) => l.id as string);
    if (!visibleIds.length) continue;
    const { error: upErr } = await admin.from("leads").update({ owner_id: ownerId, allotted_at }).in("id", visibleIds);
    if (upErr) return { error: dbError(upErr) };
    assigned.push(...visibleIds);
  }

  const who = ownerId ? display("owner_id", ownerId, lk) : "the unassigned pool";
  await logActivity(
    supabase,
    assigned.map((id) => ({ lead_id: id, actor_id: profile.id, type: "assigned", summary: `${profile.full_name} assigned this lead to ${who}` })),
  );
  return done({ message: `${assigned.length} lead(s) assigned to ${who}` });
}

export async function bulkStage(ids: string[], stageId: string): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const parsed = idList.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const lk = await getLookups();
  const stage = lk.stages.find((s) => s.id === stageId);
  if (!stage) return { error: "Choose a stage" };

  const { data, error } = await supabase.from("leads").update({ stage_id: stageId, sub_stage_id: null }).in("id", parsed.data).select("id");
  if (error) return { error: dbError(error) };
  await logActivity(
    supabase,
    (data ?? []).map((l) => ({ lead_id: l.id, actor_id: profile.id, type: "stage_change", summary: `${profile.full_name} moved this lead to ${stage.name}` })),
  );
  return done({ message: `${data?.length ?? 0} lead(s) moved to ${stage.name}` });
}

export async function deleteLeads(ids: string[]): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  if (profile.role !== "admin") return { error: "Only admins can delete leads" };
  const parsed = idList.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error, count } = await supabase.from("leads").delete({ count: "exact" }).in("id", parsed.data);
  if (error) return { error: dbError(error) };
  return done({ message: `${count ?? 0} lead(s) deleted` });
}

export async function rechurnLead(id: string, reason: string, ownerId: string | null): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  if (!isStaff(profile.role)) return { error: "Only managers and admins can rechurn leads" };
  if (reason.trim().length < 3) return { error: "Give a reason for rechurning" };
  const lk = await getLookups();
  const first = lk.stages[0];
  if (!first) return { error: "No stages are configured" };
  if (ownerId && !lk.users.some((u) => u.id === ownerId)) return { error: "Unknown user" };

  const { data: lead } = await supabase.from("leads").select("rechurn_count, owner_id, stage_id").eq("id", id).maybeSingle();
  if (!lead) return { error: "Lead not found" };
  const rechurned = lk.subStages.find((s) => s.stage_id === first.id && /rechurn/i.test(s.name));
  const now = new Date().toISOString();

  // close open follow-ups first: the lead may leave this user's visibility once it is reassigned
  await supabase.from("tasks").update({ status: "cancelled" }).eq("lead_id", id).eq("status", "pending");
  await logActivity(supabase, [
    {
      lead_id: id,
      actor_id: profile.id,
      type: "rechurn",
      summary: `${profile.full_name} rechurned this lead`,
      details: { fields: { Reason: reason.trim(), "Previous Stage": display("stage_id", lead.stage_id, lk), "Previous Owner": display("owner_id", lead.owner_id, lk), "New Owner": display("owner_id", ownerId, lk) } },
    },
  ]);
  const { error } = await createAdminClient()
    .from("leads")
    .update({
      stage_id: first.id,
      sub_stage_id: rechurned?.id ?? null,
      attempt_count: 0,
      rechurn_count: lead.rechurn_count + 1,
      last_rechurned_at: now,
      owner_id: ownerId,
      allotted_at: ownerId ? now : null,
    })
    .eq("id", id);
  if (error) return { error: dbError(error) };
  return done({ message: "Lead rechurned" });
}

// --------------------------------------------------------- lead actions ---

export async function addNote(leadId: string, text: string): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const note = text.trim();
  if (!note) return { error: "Write a note first" };
  if (note.length > 4000) return { error: "Note is too long" };
  const { error } = await supabase
    .from("lead_activities")
    .insert({ lead_id: leadId, actor_id: profile.id, type: "note", summary: `${profile.full_name} added a note`, details: { text: note } });
  return error ? { error: dbError(error) } : done({ message: "Note added" });
}

export async function addTask(leadId: string, v: { title: string; due_at: string; assigned_to?: string }): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const title = v.title?.trim();
  const due = new Date(v.due_at);
  if (!title) return { error: "Task title is required" };
  if (Number.isNaN(due.getTime())) return { error: "Choose a due date and time" };
  const assignee = isStaff(profile.role) && isUuid(v.assigned_to) ? v.assigned_to : profile.id;

  const { error } = await supabase
    .from("tasks")
    .insert({ lead_id: leadId, title, due_at: due.toISOString(), assigned_to: assignee, created_by: profile.id });
  if (error) return { error: dbError(error) };
  await logActivity(supabase, [
    { lead_id: leadId, actor_id: profile.id, type: "task", summary: `${profile.full_name} scheduled a follow-up: ${title}`, details: { due_at: due.toISOString() } },
  ]);
  return done({ message: "Follow-up scheduled" });
}

export async function completeTask(taskId: string, status: "done" | "cancelled" = "done"): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const { data: task, error } = await supabase
    .from("tasks")
    .update({ status, completed_at: new Date().toISOString(), completed_by: profile.id })
    .eq("id", taskId)
    .eq("status", "pending")
    .select("lead_id, title")
    .maybeSingle();
  if (error) return { error: dbError(error) };
  if (!task) return { error: "Follow-up not found or already closed" };
  await logActivity(supabase, [
    { lead_id: task.lead_id, actor_id: profile.id, type: "task", summary: `${profile.full_name} ${status === "done" ? "completed" : "cancelled"} follow-up: ${task.title}` },
  ]);
  return done({ message: status === "done" ? "Marked done" : "Cancelled" });
}

const OUTCOMES = ["connected", "no_answer", "busy", "switched_off", "wrong_number", "callback"] as const;

export async function logCall(
  leadId: string,
  v: { outcome: string; duration_sec?: number; notes?: string; followup_at?: string; direction?: string },
): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  if (!OUTCOMES.includes(v.outcome as (typeof OUTCOMES)[number])) return { error: "Choose a call outcome" };
  const duration = Math.max(0, Math.min(86_400, Math.round(Number(v.duration_sec) || 0)));
  const followup = v.followup_at ? new Date(v.followup_at) : null;
  if (followup && Number.isNaN(followup.getTime())) return { error: "Follow-up date is not valid" };

  const { data: lead } = await supabase.from("leads").select("attempt_count").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "Lead not found" };

  const { error } = await supabase.from("call_logs").insert({
    lead_id: leadId,
    user_id: profile.id,
    direction: v.direction === "inbound" ? "inbound" : "outbound",
    outcome: v.outcome,
    duration_sec: duration,
    notes: v.notes?.trim() || null,
  });
  if (error) return { error: dbError(error) };

  await supabase.from("leads").update({ attempt_count: lead.attempt_count + 1, last_contacted_at: new Date().toISOString() }).eq("id", leadId);
  if (followup) {
    await supabase.from("tasks").insert({ lead_id: leadId, title: "Call back", due_at: followup.toISOString(), assigned_to: profile.id, created_by: profile.id });
  }
  await logActivity(supabase, [
    {
      lead_id: leadId,
      actor_id: profile.id,
      type: "call",
      summary: `${profile.full_name} logged a call (${v.outcome.replace("_", " ")})`,
      details: { fields: { Duration: `${duration}s`, Attempt: String(lead.attempt_count + 1), Notes: v.notes?.trim() || "N/A" } },
    },
  ]);
  return done({ message: "Call logged" });
}

export async function sendMessage(
  leadId: string,
  v: { channel: "email" | "sms" | "whatsapp"; subject?: string; body: string },
): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  if (!["email", "sms", "whatsapp"].includes(v.channel)) return { error: "Unknown channel" };
  const body = v.body?.trim();
  if (!body) return { error: "Message is empty" };
  if (v.channel === "email" && !v.subject?.trim()) return { error: "Subject is required" };

  const { data: lead } = await supabase.from("leads").select("mobile, email, dnd").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "Lead not found" };
  if (lead.dnd) return { error: "This lead is marked Do Not Disturb" };
  const recipient = v.channel === "email" ? lead.email : lead.mobile;
  if (!recipient) return { error: `Lead has no ${v.channel === "email" ? "email address" : "mobile number"}` };

  const result = await deliver(v.channel, recipient, v.subject?.trim() || null, body);
  const { error } = await supabase.from("messages").insert({
    lead_id: leadId,
    channel: v.channel,
    recipient,
    subject: v.subject?.trim() || null,
    body,
    status: result.status,
    provider_ref: result.provider_ref ?? null,
    error: result.error ?? null,
    sent_by: profile.id,
  });
  if (error) return { error: dbError(error) };
  await logActivity(supabase, [
    {
      lead_id: leadId,
      actor_id: profile.id,
      type: v.channel,
      summary: `${profile.full_name} ${result.status === "failed" ? "tried to send" : result.status === "sent" ? "sent" : "logged"} ${v.channel === "email" ? "an email" : v.channel === "sms" ? "an SMS" : "a WhatsApp message"}`,
      details: { text: body, ...(v.subject ? { fields: { Subject: v.subject } } : {}) },
    },
  ]);
  if (result.status === "failed") return done({ error: `Email was not delivered: ${result.error}` });
  // "logged" tells the client to open the device app (mail / SMS / WhatsApp) to actually send it
  return done({ message: result.status === "sent" ? "Email sent" : "logged" });
}

// ---------------------------------------------- enrolment + opportunity ---

export async function enrollLead(
  leadId: string,
  v: { university_id: string; course_id: string; fee_amount: number; paid_amount: number; enrolled_on: string; enrollment_no?: string; notes?: string },
): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const lk = await getLookups();
  const course = lk.courses.find((c) => c.id === v.course_id && c.university_id === v.university_id);
  if (!course) return { error: "Choose a university and one of its courses" };
  const fee = Number(v.fee_amount);
  const paid = Number(v.paid_amount);
  if (!(fee >= 0) || !(paid >= 0)) return { error: "Amounts must be zero or more" };
  if (paid > fee) return { error: "Paid amount cannot be more than the fee" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.enrolled_on)) return { error: "Choose the enrolment date" };
  const won = lk.stages.find((s) => s.is_won);
  if (!won) return { error: "No stage is marked as 'won'. Add one in Configuration → Masters." };

  const { error } = await supabase.from("enrollments").upsert(
    {
      lead_id: leadId,
      university_id: v.university_id,
      course_id: v.course_id,
      fee_amount: fee,
      paid_amount: paid,
      enrolled_on: v.enrolled_on,
      enrollment_no: v.enrollment_no?.trim() || null,
      notes: v.notes?.trim() || null,
      created_by: profile.id,
    },
    { onConflict: "lead_id" },
  );
  if (error) return { error: dbError(error) };

  await supabase
    .from("leads")
    .update({ stage_id: won.id, sub_stage_id: lk.subStages.find((s) => s.stage_id === won.id)?.id ?? null, university_id: v.university_id, course_id: v.course_id })
    .eq("id", leadId);
  await supabase.from("tasks").update({ status: "cancelled" }).eq("lead_id", leadId).eq("status", "pending");
  await logActivity(supabase, [
    {
      lead_id: leadId,
      actor_id: profile.id,
      type: "enrolled",
      summary: `${profile.full_name} enrolled this lead in ${course.name}`,
      details: { fields: { University: display("university_id", v.university_id, lk), Fee: String(fee), Paid: String(paid) } },
    },
  ]);
  return done({ message: "Lead enrolled" });
}

export async function updateEnrollmentPayment(id: string, paid: number): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const { data: row } = await supabase.from("enrollments").select("lead_id, fee_amount").eq("id", id).maybeSingle();
  if (!row) return { error: "Enrolment not found" };
  if (!(paid >= 0) || paid > Number(row.fee_amount)) return { error: "Paid amount must be between 0 and the fee" };
  const { error } = await supabase.from("enrollments").update({ paid_amount: paid }).eq("id", id);
  if (error) return { error: dbError(error) };
  await logActivity(supabase, [{ lead_id: row.lead_id, actor_id: profile.id, type: "enrolled", summary: `${profile.full_name} updated paid amount to ${paid}` }]);
  return done({ message: "Payment updated" });
}

export async function saveOpportunity(
  leadId: string,
  v: { id?: string; title: string; amount: number; probability: number; expected_close?: string; status?: string; notes?: string },
): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const title = v.title?.trim();
  if (!title) return { error: "Title is required" };
  const amount = Number(v.amount);
  const probability = Math.round(Number(v.probability));
  if (!(amount >= 0)) return { error: "Amount must be zero or more" };
  if (!(probability >= 0 && probability <= 100)) return { error: "Probability must be 0-100" };
  const status = ["open", "won", "lost"].includes(v.status ?? "") ? v.status : "open";
  const row = { title, amount, probability, status, expected_close: v.expected_close || null, notes: v.notes?.trim() || null };

  const { error } = v.id
    ? await supabase.from("opportunities").update(row).eq("id", v.id)
    : await supabase.from("opportunities").insert({ ...row, lead_id: leadId, created_by: profile.id });
  if (error) return { error: dbError(error) };
  await logActivity(supabase, [
    { lead_id: leadId, actor_id: profile.id, type: "opportunity", summary: `${profile.full_name} ${v.id ? "updated" : "created"} opportunity: ${title} (${status})` },
  ]);
  return done({ message: "Opportunity saved" });
}

/** Sends the lead to the external URL set in Configuration → Settings (e.g. a university's lead API). */
export async function postLead(leadId: string): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const url = await getSetting<string>(supabase, "lead_post_webhook", "");
  if (!/^https?:\/\//.test(url)) return { error: "No Lead Post URL is configured. An admin can set it in Configuration → Settings." };
  const { data: lead } = await supabase
    .from("leads")
    .select("lead_no, student_name, mobile, email, city, state, product, remarks, source:lead_sources(name), university:universities(name), course:courses(name), stage:stages(name)")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { error: "Lead not found" };

  let status: "success" | "failed" = "failed";
  let http: number | null = null;
  let response = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(10_000),
    });
    http = res.status;
    response = (await res.text()).slice(0, 2000);
    if (res.ok) status = "success";
  } catch (e) {
    response = e instanceof Error ? e.message : "Request failed";
  }

  await supabase.from("lead_posts").insert({ lead_id: leadId, target: url, status, http_status: http, response, posted_by: profile.id });
  await logActivity(supabase, [{ lead_id: leadId, actor_id: profile.id, type: "post", summary: `${profile.full_name} posted this lead (${status})` }]);
  return done(status === "success" ? { message: "Lead posted" } : { error: `Post failed${http ? ` (HTTP ${http})` : ""}: ${response.slice(0, 120)}` });
}
