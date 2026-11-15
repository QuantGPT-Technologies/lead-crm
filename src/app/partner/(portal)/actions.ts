"use server";

import { revalidatePath, updateTag } from "next/cache";
import { chunk } from "@/lib/data";
import { getPartnerSession, partnerLabel } from "@/lib/partner-auth";
import { firstStageId, matchCourse, partnerCourses, partnerSourceId } from "@/lib/partner-data";
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
