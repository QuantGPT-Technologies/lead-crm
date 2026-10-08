"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Select } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Named } from "@/lib/types";
import { distributeLeads } from "../ops-actions";

interface User {
  id: string; name: string; code: string; role: string; load: number;
}

export function DistributeForm({ unassigned, users, sources, stages, batches, initialBatch }: { unassigned: number; users: User[]; sources: Named[]; stages: Named[]; batches: Named[]; initialBatch: string }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [count, setCount] = useState(String(Math.min(unassigned, 100) || 1));
  const [filters, setFilters] = useState({ source: "", stage: "", batch: initialBatch });
  const [pending, start] = useTransition();
  const opts = (list: Named[]) => list.map((x) => ({ value: x.id, label: x.name }));
  const each = picked.size ? Math.floor(Number(count) / picked.size) : 0;

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <form
      className="grid gap-4 lg:grid-cols-[1fr_1.4fr]"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (notify(await distributeLeads({ agentIds: [...picked], count: Number(count), ...filters }))) setPicked(new Set());
        });
      }}
    >
      <Card className="space-y-3 self-start p-4">
        <div className="rounded-md bg-soft p-4 text-center">
          <p className="text-3xl font-extrabold text-brand">{unassigned}</p>
          <p className="text-muted">leads in the unassigned pool</p>
        </div>
        <Field label="Only from upload">
          <Select value={filters.batch} onChange={(e) => setFilters({ ...filters, batch: e.target.value })} options={opts(batches)} placeholder="Any" />
        </Field>
        <Field label="Only source">
          <Select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} options={opts(sources)} placeholder="Any" />
        </Field>
        <Field label="Only stage">
          <Select value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })} options={opts(stages)} placeholder="Any" />
        </Field>
        <Field label="How many leads to distribute" required>
          <input type="number" min={1} max={5000} required value={count} onChange={(e) => setCount(e.target.value)} className="input" />
        </Field>
        <p className="text-xs text-muted">
          Oldest leads go first and are shared equally (round robin) between the selected users{picked.size ? ` - about ${each} each` : ""}.
        </p>
        <Button type="submit" disabled={pending || picked.size === 0 || unassigned === 0} className="w-full">
          {pending ? "Distributing..." : `Distribute to ${picked.size} user(s)`}
        </Button>
      </Card>

      <Card className="overflow-x-auto">
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>
              <th className="w-10">
                <input type="checkbox" aria-label="Select all users" checked={picked.size === users.length && users.length > 0} onChange={() => setPicked(picked.size === users.length ? new Set() : new Set(users.map((u) => u.id)))} />
              </th>
              <th>User</th>
              <th>User ID</th>
              <th>Role</th>
              <th>Leads held now</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <input type="checkbox" aria-label={`Select ${u.name}`} checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
                </td>
                <td className="font-semibold">{u.name}</td>
                <td>{u.code}</td>
                <td className="capitalize">{u.role}</td>
                <td>{u.load}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </form>
  );
}
