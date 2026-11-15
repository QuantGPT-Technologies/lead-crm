"use client";

import { useState, useTransition } from "react";
import { Mail, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, Empty, Field, Modal } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Partner } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";
import { createPartner, resendPartnerInvite, updatePartner } from "./actions";

type Dialog = { kind: "new" } | { kind: "edit"; partner: Partner };

function Verified({ at, label }: { at: string | null; label: string }) {
  return <Badge color={at ? "#16a34a" : "#d97706"}>{label} {at ? "verified" : "pending"}</Badge>;
}

export function PartnersTable({ partners, leadCounts }: { partners: Partner[]; leadCounts: Record<string, number> }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [pending, start] = useTransition();
  const editing = dialog?.kind === "edit" ? dialog.partner : null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog) return;
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "");
    const values = { full_name: s("full_name"), organization: s("organization"), email: s("email"), phone: s("phone"), city: s("city"), is_active: f.get("is_active") === "on" };
    start(async () => {
      const res = editing ? await updatePartner(editing.id, values) : await createPartner(values);
      if (notify(res)) setDialog(null);
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-sm text-muted">
          {partners.filter((p) => p.is_active).length} active partner(s). Partners sign in at <span className="font-mono">/partner/login</span>
        </p>
        <Button onClick={() => setDialog({ kind: "new" })}><Plus size={15} /> Add partner</Button>
      </div>
      {partners.length === 0 ? (
        <Empty>No partners yet. Add one; they get an email to verify their address and set a password, then sign in with that email and password.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="table-grid w-full border-collapse">
            <thead>
              <tr>{["Partner ID", "Name", "Organization", "Email", "Mobile", "Verification", "Leads", "Last sign-in", "Status", ""].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono">{p.partner_code}</td>
                  <td className="font-semibold">{p.full_name}</td>
                  <td>{p.organization ?? ""}</td>
                  <td>{p.email}</td>
                  <td className="whitespace-nowrap">{p.phone}</td>
                  <td><Verified at={p.email_verified_at} label="Email" /></td>
                  <td>{leadCounts[p.id] ?? 0}</td>
                  <td className="whitespace-nowrap text-muted">{p.last_login_at ? fmtDateTime(p.last_login_at) : "Never"}</td>
                  <td><Badge color={p.is_active ? "#16a34a" : "#dc2626"}>{p.is_active ? "Active" : "Deactivated"}</Badge></td>
                  <td className="whitespace-nowrap text-right">
                    <Button variant="ghost" className="h-8" disabled={pending || !p.is_active} title={`Send verification / password email to ${p.email}`}
                      aria-label={`Send verification email to ${p.full_name}`} onClick={() => start(async () => { notify(await resendPartnerInvite(p.id)); })}>
                      <Mail size={14} />
                    </Button>
                    <Button variant="ghost" className="h-8" aria-label={`Edit ${p.full_name}`} onClick={() => setDialog({ kind: "edit", partner: p })}>
                      <Pencil size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <Modal title={editing ? `Edit ${editing.full_name}` : "Add partner"} onClose={() => setDialog(null)}>
          <form className="space-y-3" onSubmit={submit}>
            <Field label="Contact name" required><input name="full_name" required defaultValue={editing?.full_name} className="input" /></Field>
            <Field label="Organization"><input name="organization" defaultValue={editing?.organization ?? ""} className="input" /></Field>
            <Field label="Email" required>
              <input name="email" type="email" required={!editing} disabled={!!editing} defaultValue={editing?.email ?? ""} autoComplete="off" className="input" />
            </Field>
            {editing && <p className="-mt-1 text-xs text-muted">The email cannot be changed. To use a new email, add a new partner.</p>}
            <Field label="Mobile number" required>
              <input name="phone" type="tel" required defaultValue={editing?.phone ?? ""} placeholder="98765 43210" className="input" />
            </Field>
            <Field label="City"><input name="city" defaultValue={editing?.city ?? ""} className="input" /></Field>
            {editing ? (
              <label className="flex items-center gap-2 font-semibold"><input type="checkbox" name="is_active" defaultChecked={editing.is_active} /> Active (can sign in)</label>
            ) : (
              <>
                <input type="hidden" name="is_active" value="on" />
                <p className="text-xs text-muted">The partner gets an email link to verify their address and choose a password. The mobile number is saved for contact.</p>
              </>
            )}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save" : "Create and send email"}</Button>
              <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
