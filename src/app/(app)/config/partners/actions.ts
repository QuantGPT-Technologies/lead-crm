"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { sendPartnerSetupEmail } from "@/lib/partner-email";
import { toE164Phone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { isValidEmail } from "@/lib/utils";

const UUID = /^[0-9a-f-]{36}$/i;

interface PartnerForm { full_name: string; organization?: string; email?: string; phone: string; city?: string; is_active?: boolean }

async function requireAdmin() {
  const { profile } = await getSession();
  return profile.role === "admin" ? profile : null;
}

function clean(v: PartnerForm) {
  const text = (s: unknown, max = 200) => (typeof s === "string" ? s.trim().slice(0, max) : "");
  const full_name = text(v.full_name);
  const phone = toE164Phone(text(v.phone, 30));
  if (full_name.length < 2) return { error: "Enter the partner's name" };
  if (!phone) return { error: "Enter a valid mobile number (10 digits, or with +country code)" };
  return { values: { full_name, organization: text(v.organization) || null, city: text(v.city) || null, phone } };
}

const dbError = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "A partner with this email already exists" : e.message;

export async function createPartner(v: PartnerForm): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!me) return { error: "Only admins can add partners" };
  const checked = clean(v);
  if ("error" in checked) return { error: checked.error };
  const email = typeof v.email === "string" ? v.email.trim().toLowerCase() : "";
  if (!isValidEmail(email) || email.length > 254) return { error: "Enter a valid email address" };

  const admin = createAdminClient();
  const [{ data: staff }, { data: taken }] = await Promise.all([
    admin.from("profiles").select("id").eq("email", email).maybeSingle(),
    admin.from("partners").select("id").eq("email", email).maybeSingle(),
  ]);
  if (staff) return { error: "This email belongs to a team member. Partners need their own email address." };
  if (taken) return { error: "A partner with this email already exists" };

  // The partner never sees this password; they choose their own from the emailed link.
  const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(24).toString("base64url"), email_confirm: true });
  if (error) return { error: error.message.includes("already") ? "This email already has a login. Use a different email." : error.message };
  const { data: row, error: insertError } = await admin
    .from("partners")
    .insert({ id: data.user.id, email, created_by: me.id, ...checked.values })
    .select("partner_code")
    .single();
  if (insertError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: dbError(insertError) };
  }
  revalidatePath("/config/partners");
  const mailError = await sendPartnerSetupEmail(email);
  return mailError
    ? { message: `Partner ${row.partner_code} created, but ${mailError} Use the email button to retry.` }
    : { message: `Partner ${row.partner_code} created. A verification email was sent to ${email}.` };
}

export async function updatePartner(id: string, v: PartnerForm): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Only admins can edit partners" };
  if (!UUID.test(String(id))) return { error: "Partner not found" };
  const checked = clean(v);
  if ("error" in checked) return { error: checked.error };
  const admin = createAdminClient();
  const { data: before } = await admin.from("partners").select("id").eq("id", id).maybeSingle();
  if (!before) return { error: "Partner not found" };
  const active = v.is_active !== false;
  const { error } = await admin
    .from("partners")
    .update({ ...checked.values, is_active: active })
    .eq("id", id);
  if (error) return { error: dbError(error) };
  // Blocking the login also stops an existing session from refreshing.
  await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  revalidatePath("/config/partners");
  return { message: "Partner updated" };
}

export async function resendPartnerInvite(id: string): Promise<ActionResult> {
  if (!(await requireAdmin())) return { error: "Only admins can send partner emails" };
  if (!UUID.test(String(id))) return { error: "Partner not found" };
  const { data: partner } = await createAdminClient().from("partners").select("email, is_active").eq("id", id).maybeSingle();
  if (!partner) return { error: "Partner not found" };
  if (!partner.is_active) return { error: "Activate this partner before sending an email" };
  const mailError = await sendPartnerSetupEmail(partner.email);
  return mailError ? { error: `Not sent: ${mailError}` } : { message: `Verification email sent to ${partner.email}` };
}
