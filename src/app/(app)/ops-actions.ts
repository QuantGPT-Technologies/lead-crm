"use server";

import { revalidatePath } from "next/cache";
import { getSession, isStaff } from "@/lib/auth";
import { applyLeadFilters, chunk, getLookups, logActivity, type LeadFilters } from "@/lib/data";
import { MASTERS, type MasterTable } from "@/lib/masters";
import { createAdminClient, createStatelessClient } from "@/lib/supabase/server";
import type { ActionResult, Role } from "@/lib/types";
import { isValidEmail, isValidMobile, normalizeMobile } from "@/lib/utils";

const done = <T extends ActionResult>(res: T) => {
  revalidatePath("/", "layout");
  return res;
};
const msg = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "That value already exists" : e.code === "23503" ? "It is still in use and cannot be removed" : e.code === "42501" ? "You do not have permission to do this" : e.message;

// ------------------------------------------------------------- upload -----

const ALIASES: Record<string, string[]> = {
  student_name: ["name", "student name", "student_name", "full name", "fullname", "lead name", "candidate name"],
  mobile: ["mobile", "mobile number", "mobile no", "phone", "phone number", "contact", "contact number"],
  alt_mobile: ["alt mobile", "alternate mobile", "alt_mobile", "alternate number"],
  email: ["email", "email id", "e-mail", "email address"],
  city: ["city"],
  state: ["state"],
  product: ["product"],
  campaign: ["campaign"],
  medium: ["medium"],
  remarks: ["remarks", "remark", "comment", "comments"],
  qualification: ["qualification", "highest qualification"],
  _source: ["source", "lead source"],
  _university: ["university"],
  _course: ["course", "program", "programme"],
};

export interface UploadResult extends ActionResult {
  total?: number;
  inserted?: number;
  duplicates?: number;
  invalid?: number;
  problems?: string[];
}

/** Imports parsed CSV rows as unassigned leads. Existing mobiles are skipped, never overwritten. */
export async function uploadLeads(fileName: string, rows: Record<string, string>[], defaultSourceId: string): Promise<UploadResult> {
  const { supabase, profile } = await getSession();
  if (!isStaff(profile.role)) return { error: "Only managers and admins can upload leads" };
  if (!Array.isArray(rows) || rows.length === 0) return { error: "The file has no data rows" };
  if (rows.length > 5000) return { error: "Upload at most 5000 rows per file" };

  const lk = await getLookups();
  const byName = <T extends { name: string }>(list: T[], name: string) => list.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const headerMap = new Map<string, string>();
  for (const header of Object.keys(rows[0])) {
    const key = header.trim().toLowerCase().replace(/[_\s]+/g, " ");
    const field = Object.entries(ALIASES).find(([, names]) => names.includes(key) || names.includes(key.replace(/ /g, "_")))?.[0];
    if (field) headerMap.set(header, field);
  }
  const mapped = new Set(headerMap.values());
  if (!mapped.has("student_name") || !mapped.has("mobile")) return { error: 'The file needs at least a "Name" column and a "Mobile" column' };

  const problems: string[] = [];
  const seen = new Set<string>();
  const clean: Record<string, unknown>[] = [];
  let duplicates = 0;
  const firstStage = lk.stages[0]?.id ?? null;
  const fallbackSource = lk.sources.find((s) => s.id === defaultSourceId)?.id ?? null;

  rows.forEach((raw, i) => {
    const r: Record<string, string> = {};
    for (const [header, field] of headerMap) r[field] = String(raw[header] ?? "").trim();
    const line = i + 2; // +1 for the header row, +1 because spreadsheets count from 1
    const mobile = normalizeMobile(r.mobile);
    const note = (why: string) => problems.length < 50 && problems.push(`Row ${line}: ${why}`);
    if (!r.student_name || r.student_name.length < 2) return note("name is missing");
    if (!isValidMobile(mobile)) return note(`mobile "${r.mobile}" is not valid`);
    if (seen.has(mobile)) return void duplicates++;
    seen.add(mobile);

    const university = r._university ? byName(lk.universities, r._university) : undefined;
    const course = r._course ? lk.courses.find((c) => c.name.toLowerCase() === r._course.toLowerCase() && (!university || c.university_id === university.id)) : undefined;
    const source = r._source ? byName(lk.sources, r._source) : undefined;
    clean.push({
      student_name: r.student_name.slice(0, 200),
      mobile,
      alt_mobile: r.alt_mobile && isValidMobile(normalizeMobile(r.alt_mobile)) ? normalizeMobile(r.alt_mobile) : null,
      email: r.email && isValidEmail(r.email) ? r.email.toLowerCase() : null,
      city: r.city || null,
      state: r.state || null,
      product: r.product || null,
      campaign: r.campaign || null,
      medium: r.medium || null,
      remarks: r.remarks || null,
      qualification: r.qualification || null,
      source_id: source?.id ?? fallbackSource,
      source_desc: r._source && !source ? r._source : null,
      university_id: university?.id ?? course?.university_id ?? null,
      course_id: course?.id ?? null,
      stage_id: firstStage,
      created_by: profile.id,
    });
  });
  const invalid = rows.length - clean.length - duplicates;

  const { data: batch, error: batchErr } = await supabase
    .from("upload_batches")
    .insert({ file_name: fileName.slice(0, 200), total_rows: rows.length, uploaded_by: profile.id })
    .select("id")
    .single();
  if (batchErr) return { error: msg(batchErr) };

  const insertedIds: string[] = [];
  for (const part of chunk(clean, 500)) {
    const { data, error } = await supabase
      .from("leads")
      .upsert(part.map((l) => ({ ...l, upload_batch_id: batch.id })), { onConflict: "mobile", ignoreDuplicates: true })
      .select("id");
    if (error) return { error: `Upload stopped after ${insertedIds.length} leads: ${msg(error)}` };
    insertedIds.push(...(data ?? []).map((d) => d.id as string));
  }
  duplicates += clean.length - insertedIds.length;

  await supabase.from("upload_batches").update({ inserted_rows: insertedIds.length, duplicate_rows: duplicates, invalid_rows: invalid }).eq("id", batch.id);
  await logActivity(
    supabase,
    insertedIds.map((id) => ({ lead_id: id, actor_id: profile.id, type: "created", summary: `${profile.full_name} uploaded this lead from ${fileName}` })),
  );
  return done<UploadResult>({ total: rows.length, inserted: insertedIds.length, duplicates, invalid, problems });
}

// ------------------------------------------------- distribute / allot -----

/** Reads up to `limit` lead ids the caller is allowed to see (RLS applies), oldest first. */
async function visibleLeadIds(filters: LeadFilters, limit: number) {
  const { supabase } = await getSession();
  const ids: string[] = [];
  while (ids.length < limit) {
    const size = Math.min(1000, limit - ids.length);
    const { data, error } = await applyLeadFilters(supabase.from("leads").select("id"), filters)
      .order("created_at", { ascending: true })
      .order("id")
      .range(ids.length, ids.length + size - 1);
    if (error) throw new Error(error.message);
    ids.push(...(data ?? []).map((d: { id: string }) => d.id));
    if (!data || data.length < size) break;
  }
  return ids;
}

async function setOwner(ids: string[], ownerId: string | null, actor: { id: string; full_name: string }, summary: string) {
  const admin = createAdminClient();
  const allotted_at = ownerId ? new Date().toISOString() : null;
  for (const part of chunk(ids, 150)) {
    const { error } = await admin.from("leads").update({ owner_id: ownerId, allotted_at }).in("id", part);
    if (error) throw new Error(error.message);
  }
  await logActivity(admin, ids.map((id) => ({ lead_id: id, actor_id: actor.id, type: "assigned", summary })));
}

export async function distributeLeads(v: { agentIds: string[]; count: number; source?: string; batch?: string; stage?: string }): Promise<ActionResult> {
  const { profile } = await getSession();
  if (!isStaff(profile.role)) return { error: "Only managers and admins can distribute leads" };
  const lk = await getLookups();
  const agents = lk.users.filter((u) => v.agentIds?.includes(u.id));
  if (!agents.length) return { error: "Choose at least one user to receive leads" };
  const count = Math.floor(Number(v.count));
  if (!(count >= 1 && count <= 5000)) return { error: "Number of leads must be between 1 and 5000" };

  try {
    const ids = await visibleLeadIds({ owner: "none", source: v.source, batch: v.batch, stage: v.stage }, count);
    if (!ids.length) return { error: "No unassigned leads match these filters" };

    // round robin so every agent gets an equal share, oldest leads first
    const buckets = agents.map(() => [] as string[]);
    ids.forEach((id, i) => buckets[i % agents.length].push(id));
    for (const [i, agent] of agents.entries()) {
      if (buckets[i].length) await setOwner(buckets[i], agent.id, profile, `${profile.full_name} distributed this lead to ${agent.full_name}`);
    }
    return done({ message: `${ids.length} lead(s) distributed: ${agents.map((a, i) => `${a.full_name} ${buckets[i].length}`).join(", ")}` });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Distribution failed" };
  }
}

export async function transferLeads(v: { from: string; to: string; count: number; untouchedOnly: boolean }): Promise<ActionResult> {
  const { profile } = await getSession();
  if (!isStaff(profile.role)) return { error: "Only managers and admins can move leads" };
  const lk = await getLookups();
  const from = lk.users.find((u) => u.id === v.from);
  const to = v.to === "none" ? null : lk.users.find((u) => u.id === v.to);
  if (!from) return { error: "Choose whose leads to move" };
  if (to === undefined) return { error: "Choose who receives the leads" };
  if (to?.id === from.id) return { error: "Source and destination are the same user" };
  const count = Math.floor(Number(v.count));
  if (!(count >= 1 && count <= 5000)) return { error: "Number of leads must be between 1 and 5000" };

  try {
    const ids = await visibleLeadIds({ owner: from.id, attempt: v.untouchedOnly ? "0" : undefined }, count);
    if (!ids.length) return { error: `${from.full_name} has no matching leads` };
    const target = to ? to.full_name : "the unassigned pool";
    await setOwner(ids, to?.id ?? null, profile, `${profile.full_name} moved this lead from ${from.full_name} to ${target}`);
    return done({ message: `${ids.length} lead(s) moved from ${from.full_name} to ${target}` });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Transfer failed" };
  }
}

// ------------------------------------------------------------ masters -----

export async function saveMaster(table: MasterTable, id: string | null, values: Record<string, unknown>): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  if (profile.role !== "admin") return { error: "Only admins can change configuration" };
  const def = MASTERS[table];
  if (!def) return { error: "Unknown table" };

  const row: Record<string, unknown> = {};
  for (const f of def.fields) {
    let v = values[f.name];
    if (f.type === "checkbox") v = v === true;
    else if (f.type === "number") v = v === "" || v == null ? (f.name === "sort_order" ? 0 : null) : Number(v);
    else v = typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    if (f.required && (v == null || v === "")) return { error: `${f.label} is required` };
    if (f.type === "number" && v != null && !(Number(v) >= 0)) return { error: `${f.label} must be zero or more` };
    if (f.choices && !f.choices.includes(String(v))) return { error: `${f.label} is not valid` };
    if (f.type === "color" && v == null) v = "#6366f1";
    row[f.name] = v;
  }
  if (row.is_won && row.is_lost) return { error: "A stage cannot be both won and lost" };

  const { error } = id ? await supabase.from(table).update(row).eq("id", id) : await supabase.from(table).insert(row);
  return error ? { error: msg(error) } : done({ message: "Saved" });
}

/** Masters are switched off instead of deleted so existing leads keep their history. */
export async function setMasterActive(table: MasterTable, id: string, active: boolean): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  if (profile.role !== "admin") return { error: "Only admins can change configuration" };
  if (!MASTERS[table]) return { error: "Unknown table" };
  const { error } = await supabase.from(table).update({ is_active: active }).eq("id", id);
  return error ? { error: msg(error) } : done({ message: active ? "Activated" : "Deactivated" });
}

// -------------------------------------------------------------- users -----

const ROLES: Role[] = ["admin", "manager", "agent"];
const passwordProblem = (p: string) =>
  p.length < 8 ? "Password must be at least 8 characters" : !/[a-zA-Z]/.test(p) || !/\d/.test(p) ? "Password must contain letters and numbers" : null;

export async function createUser(v: { full_name: string; email: string; password: string; role: string; manager_id?: string; phone?: string }): Promise<ActionResult> {
  const { profile } = await getSession();
  if (profile.role !== "admin") return { error: "Only admins can add users" };
  const email = v.email?.trim().toLowerCase();
  if (!v.full_name?.trim()) return { error: "Name is required" };
  if (!isValidEmail(email)) return { error: "Enter a valid email" };
  if (!ROLES.includes(v.role as Role)) return { error: "Choose a role" };
  const weak = passwordProblem(v.password ?? "");
  if (weak) return { error: weak };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password: v.password, email_confirm: true });
  if (error) return { error: error.message };

  const { data: row, error: pErr } = await admin
    .from("profiles")
    .insert({ id: data.user.id, full_name: v.full_name.trim(), email, role: v.role, manager_id: v.manager_id || null, phone: v.phone?.trim() || null })
    .select("emp_code")
    .single();
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id); // do not leave a login without a profile
    return { error: msg(pErr) };
  }
  return done({ message: `User created. User ID: ${row.emp_code}` });
}

export async function updateUser(id: string, v: { full_name: string; role: string; manager_id?: string; phone?: string; is_active: boolean }): Promise<ActionResult> {
  const { profile } = await getSession();
  if (profile.role !== "admin") return { error: "Only admins can edit users" };
  if (!v.full_name?.trim()) return { error: "Name is required" };
  if (!ROLES.includes(v.role as Role)) return { error: "Choose a role" };
  if (id === profile.id && (v.role !== "admin" || !v.is_active)) return { error: "You cannot remove your own admin access" };
  if (v.manager_id === id) return { error: "A user cannot be their own manager" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ full_name: v.full_name.trim(), role: v.role, manager_id: v.manager_id || null, phone: v.phone?.trim() || null, is_active: v.is_active })
    .eq("id", id);
  if (error) return { error: msg(error) };
  // block / unblock the login itself so a deactivated user's existing session stops refreshing
  await admin.auth.admin.updateUserById(id, { ban_duration: v.is_active ? "none" : "876000h" });
  return done({ message: "User updated" });
}

export async function resetUserPassword(id: string, password: string): Promise<ActionResult> {
  const { profile } = await getSession();
  if (profile.role !== "admin") return { error: "Only admins can reset passwords" };
  const weak = passwordProblem(password ?? "");
  if (weak) return { error: weak };
  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password });
  return error ? { error: error.message } : { message: "Password reset" };
}

// ----------------------------------------------- settings and profile -----

export async function saveSettings(v: { lead_post_webhook: string; mask_contacts_in_list: boolean }): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  if (profile.role !== "admin") return { error: "Only admins can change settings" };
  const url = v.lead_post_webhook?.trim() ?? "";
  if (url && !/^https:\/\/[^\s]+$/.test(url)) return { error: "Lead Post URL must start with https://" };
  const now = new Date().toISOString();
  const { error } = await supabase.from("app_settings").upsert([
    { key: "lead_post_webhook", value: url, updated_at: now },
    { key: "mask_contacts_in_list", value: !!v.mask_contacts_in_list, updated_at: now },
  ]);
  return error ? { error: msg(error) } : done({ message: "Settings saved" });
}

export async function setGlobalLogin(email: string, password: string): Promise<ActionResult> {
  const { profile } = await getSession();
  if (profile.role !== "admin") return { error: "Only admins can change the global login" };
  if (!isValidEmail(email?.trim() ?? "")) return { error: "Enter a valid email" };
  const weak = passwordProblem(password ?? "");
  if (weak) return { error: weak };
  const { error } = await createAdminClient().rpc("set_global_login", { p_email: email, p_password: password });
  return error ? { error: error.message } : { message: "Global login updated" };
}

export async function updateProfile(v: { full_name: string; phone: string }): Promise<ActionResult> {
  const { profile } = await getSession();
  if (!v.full_name?.trim()) return { error: "Name is required" };
  const { error } = await createAdminClient().from("profiles").update({ full_name: v.full_name.trim(), phone: v.phone?.trim() || null }).eq("id", profile.id);
  return error ? { error: msg(error) } : done({ message: "Profile updated" });
}

export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const { supabase, profile } = await getSession();
  const weak = passwordProblem(next ?? "");
  if (weak) return { error: weak };
  if (current === next) return { error: "New password must be different from the current one" };
  const check = createStatelessClient();
  const { error: wrong } = await check.auth.signInWithPassword({ email: profile.email, password: current });
  if (wrong) return { error: "Current password is incorrect" };
  await check.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.updateUser({ password: next });
  return error ? { error: error.message } : { message: "Password changed" };
}
