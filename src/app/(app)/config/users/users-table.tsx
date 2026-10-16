"use client";

import { useState, useTransition } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, Field, Modal, Select } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Profile } from "@/lib/types";
import { createUser, resetUserPassword, updateUser } from "../../ops-actions";

const ROLES = [
  { value: "agent", label: "Agent - sees only their own leads" },
  { value: "manager", label: "Manager - sees their team's and unassigned leads" },
  { value: "admin", label: "Admin - sees everything, manages configuration" },
];
const ROLE_COLOR: Record<string, string> = { admin: "#c026d3", manager: "#0284c7", agent: "#64748b" };

type Dialog = { kind: "new" } | { kind: "edit"; user: Profile } | { kind: "password"; user: Profile };

export function UsersTable({ users, selfId, agentOtp = false }: { users: Profile[]; selfId: string; agentOtp?: boolean }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [selectedRole, setSelectedRole] = useState("agent");
  const [pending, start] = useTransition();
  const managers = users.filter((u) => u.is_active && u.role !== "agent").map((u) => ({ value: u.id, label: u.full_name }));
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? "";

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
            ? await updateUser(dialog.user.id, { full_name: s("full_name"), role: s("role"), manager_id: s("manager_id"), phone: s("phone"), is_active: f.get("is_active") === "on" })
            : await resetUserPassword(dialog.user.id, s("password"));
      if (notify(res)) setDialog(null);
    });
  }

  const editing = dialog?.kind === "edit" ? dialog.user : null;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-muted">{users.filter((u) => u.is_active).length} active user(s)</p>
          <Button onClick={() => { setSelectedRole("agent"); setDialog({ kind: "new" }); }}>
          <Plus size={15} /> Add user
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["User ID", "Name", "Email", "Phone", "Role", "Reports to", "Status", ""].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {users.map((u) => (
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
                    <Button variant="ghost" className="h-8" aria-label={`Edit ${u.full_name}`} onClick={() => { setSelectedRole(u.role); setDialog({ kind: "edit", user: u }); }}>
                    <Pencil size={14} />
                  </Button>
                    {!(agentOtp && u.role === "agent") && <Button variant="ghost" className="h-8" aria-label={`Reset password of ${u.full_name}`} onClick={() => setDialog({ kind: "password", user: u })}>
                    <KeyRound size={14} />
                    </Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog && (
        <Modal title={dialog.kind === "new" ? "Add user" : dialog.kind === "edit" ? `Edit ${dialog.user.full_name}` : `Reset password - ${dialog.user.full_name}`} onClose={() => setDialog(null)}>
          <form className="space-y-3" onSubmit={submit}>
            {dialog.kind !== "password" && (
              <>
                <Field label="Full name" required>
                  <input name="full_name" required defaultValue={editing?.full_name} className="input" />
                </Field>
                {dialog.kind === "new" && (
                    <Field label="Email" required>
                    <input name="email" type="email" required autoComplete="off" className="input" />
                  </Field>
                )}
                  <Field label={agentOtp && selectedRole === "agent" ? "Registered mobile number (SMS login)" : "Phone"} required={agentOtp && selectedRole === "agent"}>
                    <input name="phone" type="tel" required={agentOtp && selectedRole === "agent"} defaultValue={editing?.phone ?? ""} className="input" />
                </Field>
                <Field label="Role" required>
                    <Select name="role" required value={selectedRole} onChange={e => setSelectedRole(e.target.value)} options={ROLES} placeholder={null} />
                </Field>
                <Field label="Reports to (manager)">
                  <Select name="manager_id" defaultValue={editing?.manager_id ?? ""} options={managers.filter((m) => m.value !== editing?.id)} placeholder="Nobody" />
                </Field>
                {editing && (
                  <label className="flex items-center gap-2 font-semibold">
                    <input type="checkbox" name="is_active" defaultChecked={editing.is_active} disabled={editing.id === selfId} />
                    Active (can sign in){editing.id === selfId && <input type="hidden" name="is_active" value="on" />}
                  </label>
                )}
              </>
            )}
              {dialog.kind !== "edit" && !(dialog.kind === "new" && agentOtp && selectedRole === "agent") && (
              <Field label={dialog.kind === "new" ? "Initial password" : "New password"} required>
                <input name="password" type="text" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters, letters and numbers" className="input" />
              </Field>
            )}
              {dialog.kind === "new" && <p className="text-xs text-muted">{agentOtp && selectedRole === "agent" ? "The agent will sign in with an SMS code sent to this mobile number. Every active agent must have a different number." : "The User ID is generated automatically. Share it with the user along with the password."}</p>}
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
