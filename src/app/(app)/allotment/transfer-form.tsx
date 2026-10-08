"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Select } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Named } from "@/lib/types";
import { transferLeads } from "../ops-actions";

/** Moves leads from one user to another (or back to the unassigned pool), e.g. when someone leaves or is overloaded. */
export function TransferForm({ users }: { users: Named[] }) {
  const [v, setV] = useState({ from: "", to: "", count: "50", untouchedOnly: false });
  const [pending, start] = useTransition();
  const opts = users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-base font-extrabold">Move leads between users</h2>
      <form
        className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => void notify(await transferLeads({ ...v, count: Number(v.count) })));
        }}
      >
        <Field label="Take leads from" required>
          <Select required value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} options={opts} />
        </Field>
        <Field label="Give them to" required>
          <Select required value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} options={[{ value: "none", label: "Unassigned pool" }, ...opts.filter((o) => o.value !== v.from)]} />
        </Field>
        <Field label="How many" required>
          <input type="number" min={1} max={5000} required value={v.count} onChange={(e) => setV({ ...v, count: e.target.value })} className="input" />
        </Field>
        <label className="flex h-9 items-center gap-2 font-semibold">
          <input type="checkbox" checked={v.untouchedOnly} onChange={(e) => setV({ ...v, untouchedOnly: e.target.checked })} />
          Only not-yet-attempted
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Moving..." : "Move leads"}
        </Button>
      </form>
    </Card>
  );
}
