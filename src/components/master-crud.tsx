"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { saveMaster, setMasterActive } from "@/app/(app)/ops-actions";
import { Badge, Button, Card, Empty, Field, Modal, Select } from "@/components/ui";
import { notify } from "@/components/toast";
import { MASTERS, type MasterField, type MasterTable } from "@/lib/masters";
import type { Row } from "@/lib/types";

type Values = Record<string, string | boolean>;

/** List + add/edit dialog for one admin-editable lookup table, generated from its definition in lib/masters.ts. */
export function MasterCrud({ table, rows, refs }: { table: MasterTable; rows: Row[]; refs: Partial<Record<MasterTable, { value: string; label: string }[]>> }) {
  const def = MASTERS[table];
  const [editing, setEditing] = useState<{ id: string | null; values: Values } | null>(null);
  const [pending, start] = useTransition();

  const blank = (): Values => Object.fromEntries(def.fields.map((f) => [f.name, f.type === "checkbox" ? false : f.type === "color" ? "#6366f1" : ""]));
  const fromRow = (r: Row): Values => Object.fromEntries(def.fields.map((f) => [f.name, f.type === "checkbox" ? r[f.name] === true : r[f.name] == null ? "" : String(r[f.name])]));
  const options = (f: MasterField) => (f.ref ? (refs[f.ref] ?? []) : (f.choices ?? []).map((c) => ({ value: c, label: c })));
  const show = (f: MasterField, r: Row) => {
    const v = r[f.name];
    if (f.type === "checkbox") return v ? "Yes" : "";
    if (f.type === "select") return options(f).find((o) => o.value === v)?.label ?? "";
    if (f.type === "color") return <span className="inline-block h-4 w-8 rounded" style={{ background: String(v) }} title={String(v)} />;
    return v == null ? "" : String(v);
  };

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-base font-extrabold">{def.label}</h2>
        <Button onClick={() => setEditing({ id: null, values: blank() })}>
          <Plus size={15} /> Add
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>
              {def.fields.map((f) => <th key={f.name}>{f.label.split(" - ")[0]}</th>)}
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {def.fields.map((f) => (
                  <td key={f.name} className="max-w-xs truncate">{show(f, r)}</td>
                ))}
                <td>
                  <Badge color={r.is_active ? "#16a34a" : "#64748b"}>{r.is_active ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="text-right">
                  <Button variant="ghost" className="h-8" aria-label="Edit" onClick={() => setEditing({ id: r.id, values: fromRow(r) })}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" className="h-8" disabled={pending} onClick={() => start(async () => void notify(await setMasterActive(table, r.id, !r.is_active)))}>
                    {r.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>Nothing here yet.</Empty>}
      </div>

      {editing && (
        <Modal title={`${editing.id ? "Edit" : "Add"} - ${def.label}`} onClose={() => setEditing(null)}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                if (notify(await saveMaster(table, editing.id, editing.values))) setEditing(null);
              });
            }}
          >
            {def.fields.map((f) => {
              const value = editing.values[f.name];
              const set = (v: string | boolean) => setEditing({ ...editing, values: { ...editing.values, [f.name]: v } });
              if (f.type === "checkbox") {
                return (
                  <label key={f.name} className="flex items-center gap-2 font-semibold">
                    <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} /> {f.label}
                  </label>
                );
              }
              return (
                <Field key={f.name} label={f.label} required={f.required}>
                  {f.type === "select" ? (
                    <Select required={f.required} value={String(value)} onChange={(e) => set(e.target.value)} options={options(f)} />
                  ) : f.type === "textarea" ? (
                    <textarea required={f.required} rows={6} value={String(value)} onChange={(e) => set(e.target.value)} className="input" />
                  ) : (
                    <input
                      type={f.type ?? "text"}
                      min={f.type === "number" ? 0 : undefined}
                      step={f.type === "number" ? "any" : undefined}
                      required={f.required}
                      value={String(value)}
                      onChange={(e) => set(e.target.value)}
                      className={f.type === "color" ? "h-9 w-20" : "input"}
                    />
                  )}
                </Field>
              );
            })}
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
