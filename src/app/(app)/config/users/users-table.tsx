"use client";

import { useState, useTransition } from "react";
import { KeyRound, Mail, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, Field, Modal, Select } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Profile } from "@/lib/types";
import { createUser, resetUserPassword, sendUserPasswordSetup, updateUser } from "../../ops-actions";

const ROLES = [
  { value: "agent", label: "Agent - sees only their own leads" },
  { value: "manager", label: "Manager - sees their own and their team's leads" },
  { value: "admin", label: "Admin - sees everything, manages configuration" },
];
const ROLE_COLOR: Record<string, string> = { admin: "#c026d3", manager: "#0284c7", agent: "#64748b" };

type Dialog = { kind: "new" } | { kind: "edit"; user: Profile } | { kind: "password"; user: Profile };

export function UsersTable({ users, selfId, directory = users }: { users: Profile[]; selfId: string; directory?: Profile[] }) {
  const [sort, setSort] = useState({ key: "full_name", asc: true });
  const ordered = [...users].sort((a, b) => String(a[sort.key as keyof Profile] ?? "").localeCompare(String(b[sort.key as keyof Profile] ?? ""), undefined, { numeric: true }) * (sort.asc ? 1 : -1));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [selectedRole, setSelectedRole] = useState("agent");
  const [pending, start] = useTransition();
  const managers = directory.filter((u) => u.is_active && u.role !== "agent").map((u) => ({ value: u.id, label: u.full_name }));
  const nameOf = (id: string | null) => directory.find((u) => u.id === id)?.full_name ?? "";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog) return;
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    start(async () => {
      const res =
        dialog.kind === "new"
          ? await createUser({ full_name: s("full_name"), email: s("email"), password: s("password"), role: s("role"), manager_id: s("manager_id"), phone: s("phone") })
          : dialog.kind === "edit"
                ? await updateUser(dialog.user.id, { full_name: s("full_name"), email: s("email"), role: s("role"), manager_id: s("manager_id"), phone: s("phone"), is_active: f.get("is_active") === "on", send_setup_email: f.get("send_setup_email") === "on" })
            : await resetUserPassword(dialog.user.id, s("password"));
        if (notify(res) || ("saved" in res && res.saved)) setDialog(null);
    });
  }

  const editing = dialog?.kind === "edit" ? dialog.user : null;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-muted">{users.filter((u) => u.is_active).length} active user(s)</p>
          <Button onClick={() => { setSelectedRole("agent"); setDialog({ kind: "new" }); }}>
          <Plus size={15} /> Add team member
        </Button>
      </div>
      <div className="flex gap-2 p-3"><select aria-label="Sort team members" value={sort.key} onChange={event => setSort({ ...sort, key: event.target.value })} className="input !w-auto">{[["full_name","Name"],["email","Email"],["role","Role"],["emp_code","Employee ID"]].map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" className="text-xs" onClick={() => setSort({ ...sort, asc: !sort.asc })}>{sort.asc ? "Ascending ?" : "Descending ?"}</button></div>
      <div className="overflow-x-auto">
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["User ID", "Name", "Email", "Phone", "Role", "Reports to", "Status", ""].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {ordered.map((u) => (
              <tr key={u.id}>
                <td className="font-mono">{u.emp_code}</td>
                <td className="font-semibold">{u.full_name}</td>
                <td>{u.email}</td>
                <td>{u.phone ?? ""}</td>
                <td>
                  <Badge color={ROLE_COLOR[u.role]}>{u.role}</Badge>
                </td>
                <td>{nameOf(u.manager_id)}</td>
                <td>
                  <Badge color={u.is_active ? "#16a34a" : "#dc2626"}>{u.is_active ? "Active" : "Deactivated"}</Badge>
                </td>
                <td className="text-right">
                    <Button variant="ghost" className="h-8" disabled={pending || !u.is_active}
                      title={`Send password setup email to ${u.email}`} aria-label={`Send password setup email to ${u.full_name}`}
                      onClick={() => start(async () => { notify(await sendUserPasswordSetup(u.id)); })}>
                      <Mail size={14} />
                    </Button>
                    <Button variant="ghost" className="h-8" aria-label={`Edit ${u.full_name}`} onClick={() => { setSelectedRole(u.role); setDialog({ kind: "edit", user: u }); }}>
                    <Pencil size={14} />
                  </Button>
                    <Button variant="ghost" className="h-8" aria-label={`Reset password of ${u.full_name}`} onClick={() => setDialog({ kind: "password", user: u })}>
                    <KeyRound size={14} />
                    </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog && (
          <Modal title={dialog.kind === "new" ? "Add team member" : dialog.kind === "edit" ? `Edit ${dialog.user.full_name}` : `Reset password - ${dialog.user.full_name}`} onClose={() => setDialog(null)}>
          <form className="space-y-3" onSubmit={submit}>
            {dialog.kind !== "password" && (
              <>
                <Field label="Full name" required>
                  <input name="full_name" required defaultValue={editing?.full_name} className="input" />
                </Field>
                    <Field label="Login email" required>
                    <input name="email" type="email" required defaultValue={editing?.email ?? ""} autoComplete="off" className="input" />
                  </Field>
                  <Field label="Phone">
                    <input name="phone" type="tel" defaultValue={editing?.phone ?? ""} className="input" />
                </Field>
                <Field label="Role" required>
                    <Select name="role" required value={selectedRole} onChange={e => setSelectedRole(e.target.value)} options={ROLES} placeholder={null} />
                </Field>
                <Field label="Reports to (manager)">
                  <Select name="manager_id" defaultValue={editing?.manager_id ?? ""} options={managers.filter((m) => m.value !== editing?.id)} placeholder="Nobody" />
                </Field>
                {editing && (
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="send_setup_email" defaultChecked className="mt-1" />
                      <span>Send a password setup email to the new address if the login email changes (active members only).</span>
                    </label>
                  )}
                  {editing && (
                  <label className="flex items-center gap-2 font-semibold">
                    <input type="checkbox" name="is_active" defaultChecked={editing.is_active} disabled={editing.id === selfId} />
                    Active (can sign in){editing.id === selfId && <input type="hidden" name="is_active" value="on" />}
                  </label>
                )}
              </>
            )}
              {dialog.kind !== "edit" && (
              <Field label={dialog.kind === "new" ? "Initial password" : "New password"} required>
                <input name="password" type="text" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters, letters and numbers" className="input" />
              </Field>
            )}
              {dialog.kind === "new" && <p className="text-xs text-muted">Share the email address and initial password with the user. They can change their password under My Profile.</p>}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
