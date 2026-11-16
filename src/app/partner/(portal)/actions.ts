"use server";

import { revalidatePath, updateTag } from "next/cache";
import { chunk } from "@/lib/data";
import { getPartnerSession, partnerLabel } from "@/lib/partner-auth";
import { firstStageId, matchCourse, partnerCourses, partnerSourceId, partnerStatusOptions } from "@/lib/partner-data";
import { leadProblem, MAX_PARTNER_ROWS, type PartnerLeadInput } from "@/lib/partner-paste";
import { isValidMobile, normalizeMobile } from "@/lib/utils";

const UUID = /^[0-9a-f-]{36}$/i;

const refreshStaffViews = () => {
  updateTag("crm-dashboard");
  revalidatePath("/partner", "layout");
};

async function existingMobiles(mobiles: string[]) {
  const { admin } = await getPartnerSession();
  const found = new Set<string>();
  for (const part of chunk([...new Set(mobiles)], 200)) {
    const { data, error } = await admin.from("leads").select("mobile").in("mobile", part);
    if (error) throw new Error("Could not check for existing leads");
    (data ?? []).forEach((l) => found.add(l.mobile as string));
  }
  return found;
}

/** Preview helper: which of these mobile numbers are already in the CRM. */
export async function checkExistingMobiles(mobiles: string[]): Promise<{ existing?: string[]; error?: string }> {
  if (!Array.isArray(mobiles) || mobiles.length > MAX_PARTNER_ROWS) return { error: `Add at most ${MAX_PARTNER_ROWS} leads at a time` };
  const clean = mobiles.map((m) => normalizeMobile(m)).filter(isValidMobile);
  try { return { existing: [...(await existingMobiles(clean))] }; }
  catch (e) { return { error: (e as Error).message }; }
}

export interface PartnerSubmitResult {
  error?: string;
  inserted?: number;
  skipped?: { row: number; reason: string }[];
}

/** Adds the confirmed rows as new unassigned leads, attributed to the signed-in partner. */
export async function submitPartnerLeads(rows: PartnerLeadInput[]): Promise<PartnerSubmitResult> {
  const { partner, admin } = await getPartnerSession();
  if (!Array.isArray(rows) || rows.length === 0) return { error: "There are no leads to add" };
  if (rows.length > MAX_PARTNER_ROWS) return { error: `Add at most ${MAX_PARTNER_ROWS} leads at a time` };

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const leads = rows.map((r) => ({
    student_name: str(r?.student_name), mobile: str(r?.mobile), email: str(r?.email), city: str(r?.city),
    state: str(r?.state), course: str(r?.course), remarks: str(r?.remarks),
  }));

  const [courses, stageId, sourceId] = await Promise.all([partnerCourses(admin), firstStageId(admin), partnerSourceId(admin)]);
  let existing: Set<string>;
  try { existing = await existingMobiles(leads.map((l) => normalizeMobile(l.mobile)).filter(isValidMobile)); }
  catch (e) { return { error: (e as Error).message }; }

  const skipped: { row: number; reason: string }[] = [];
  const seen = new Set<string>();
  const accepted: { row: Record<string, unknown>; remarks: string }[] = [];
  leads.forEach((lead, i) => {
    const problem = leadProblem(lead);
    if (problem) return skipped.push({ row: i + 1, reason: problem });
    const mobile = normalizeMobile(lead.mobile);
    if (seen.has(mobile)) return skipped.push({ row: i + 1, reason: "Same mobile number appears earlier in this list" });
    if (existing.has(mobile)) return skipped.push({ row: i + 1, reason: "This mobile number is already registered" });
    seen.add(mobile);
    const course = matchCourse(courses, lead.course);
    accepted.push({
      remarks: lead.remarks,
      row: {
        student_name: lead.student_name.slice(0, 200),
        mobile,
        email: lead.email ? lead.email.toLowerCase() : null,
        city: lead.city || null,
        state: lead.state || null,
        course_id: course?.id ?? null,
        university_id: course?.university_id ?? null,
        // A course that is not in the list is kept as typed so the counsellor still sees it.
        product: !course && lead.course ? lead.course.slice(0, 200) : null,
        source_id: sourceId,
        source_desc: partnerLabel(partner).slice(0, 200),
        stage_id: stageId,
        partner_id: partner.id,
      },
    });
  });
  if (!accepted.length) return { inserted: 0, skipped };

  const { data: batch } = await admin
    .from("upload_batches")
    .insert({ file_name: `Partner ${partner.partner_code} · ${partnerLabel(partner)}`.slice(0, 200), total_rows: rows.length })
    .select("id")
    .single();

  const who = `${partnerLabel(partner)} (partner)`;
  let inserted = 0;
  for (const part of chunk(accepted, 250)) {
    const { data, error } = await admin.from("leads").insert(part.map((a) => ({ ...a.row, upload_batch_id: batch?.id ?? null }))).select("id");
    if (error) {
      if (batch) await admin.from("upload_batches").update({ inserted_rows: inserted, invalid_rows: skipped.length }).eq("id", batch.id);
      return { error: `Stopped after ${inserted} leads: ${error.message}`, inserted, skipped };
    }
    const ids = (data ?? []).map((d) => d.id as string);
    const history = ids.flatMap((id, i) => [
      { lead_id: id, partner_id: partner.id, type: "created", summary: `${who} submitted this lead` },
      ...(part[i].remarks ? [{ lead_id: id, partner_id: partner.id, type: "partner_remark", summary: `${who} added a remark`, details: { text: part[i].remarks.slice(0, 2000) } }] : []),
    ]);
    await admin.from("lead_activities").insert(history);
    inserted += ids.length;
  }
  if (batch) await admin.from("upload_batches").update({ inserted_rows: inserted, duplicate_rows: skipped.filter((s) => s.reason.includes("mobile")).length, invalid_rows: skipped.filter((s) => !s.reason.includes("mobile")).length }).eq("id", batch.id);
  refreshStaffViews();
  return { inserted, skipped };
}

/** Remarks are append-only: there is no edit or delete action for partners. */
export async function addPartnerRemark(leadId: string, text: string): Promise<{ error?: string; message?: string }> {
  const { partner, admin } = await getPartnerSession();
  const remark = typeof text === "string" ? text.trim() : "";
  if (!remark) return { error: "Write a remark first" };
  if (remark.length > 2000) return { error: "Keep the remark under 2000 characters" };
  if (!UUID.test(String(leadId))) return { error: "Lead not found" };
  const { data: lead } = await admin.from("leads").select("id").eq("id", leadId).eq("partner_id", partner.id).maybeSingle();
  if (!lead) return { error: "Lead not found" };
  const { error } = await admin.from("lead_activities").insert({
    lead_id: leadId, partner_id: partner.id, type: "partner_remark",
    summary: `${partnerLabel(partner)} (partner) added a remark`, details: { text: remark },
  });
  if (error) return { error: "Could not save the remark. Please try again." };
  updateTag("crm-dashboard");
  revalidatePath(`/partner/leads/${leadId}`);
  return { message: "Remark added" };
}

/** Partners can move their own lead to another status; the change is logged for both sides. */
export async function updatePartnerLeadStatus(leadId: string, stageId: string, subStageId: string | null, otherText?: string): Promise<{ error?: string; message?: string }> {
  const { partner, admin } = await getPartnerSession();
  if (!UUID.test(String(leadId)) || !UUID.test(String(stageId))) return { error: "Choose a status" };
  const options = await partnerStatusOptions(admin);
  const stage = options.find((o) => o.id === stageId);
  if (!stage) return { error: "This status is no longer available" };
  const sub = stage.subs.length ? stage.subs.find((x) => x.id === subStageId) : null;
  if (stage.subs.length && !sub) return { error: "Choose a sub-status" };
  const isOther = stage.name.toLowerCase() === "other";
  const other = typeof otherText === "string" ? otherText.trim() : "";
  if (isOther && (!other || other.length > 200)) return { error: "Describe the status (1–200 characters)" };

  const { data: lead } = await admin.from("leads").select("id, stage_id, sub_stage_id, other_fields").eq("id", leadId).eq("partner_id", partner.id).maybeSingle();
  if (!lead) return { error: "Lead not found" };
  const custom = { ...((lead.other_fields ?? {}) as Record<string, string>) };
  delete custom.sub_stage_id;
  if (isOther) custom.stage_id = other; else delete custom.stage_id;
  const nextSub = sub?.id ?? null;
  const previousOther = (lead.other_fields as Record<string, string> | null)?.stage_id ?? "";
  if (lead.stage_id === stage.id && (lead.sub_stage_id ?? null) === nextSub && (!isOther || previousOther === other)) return { message: "No change" };

  const label = (id: string | null, subId: string | null) => {
    const s = options.find((o) => o.id === id);
    if (!s) return "None";
    const x = s.subs.find((y) => y.id === subId);
    return x ? `${s.name} / ${x.name}` : s.name;
  };
  const { error } = await admin.from("leads").update({ stage_id: stage.id, sub_stage_id: nextSub, other_fields: custom }).eq("id", leadId).eq("partner_id", partner.id);
  if (error) return { error: "Could not update the status. Please try again." };
  const after = label(stage.id, nextSub) + (isOther ? ` (${other})` : "");
  await admin.from("lead_activities").insert({
    lead_id: leadId, partner_id: partner.id, type: "stage_change",
    summary: `${partnerLabel(partner)} (partner) moved this lead to ${stage.name}`,
    details: { fields: { Stage: `${label(lead.stage_id, lead.sub_stage_id)} → ${after}` } },
  });
  refreshStaffViews();
  revalidatePath(`/partner/leads/${leadId}`);
  return { message: `Status changed to ${after}` };
}
