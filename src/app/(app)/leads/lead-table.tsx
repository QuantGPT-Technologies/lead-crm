"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, RefreshCw, SquarePen } from "lucide-react";
import { Badge, Button, Empty, Modal, Select } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assignLeads, bulkStage, deleteLeads } from "./actions";

export interface LeadRow {
  id: string; lead_no: string; name: string; mobile: string; email: string; university: string; course: string;
  stage: string; stageColor: string; subStage: string; source: string; owner: string; product: string; city: string;
  priority: string; attempts: number; followup: string; overdue: boolean; created: string;
}

type Opt = { value: string; label: string };

const COLUMNS: { key: keyof LeadRow; label: string; sort?: string; hidden?: boolean }[] = [
  { key: "name", label: "Student Name", sort: "student_name" },
  { key: "mobile", label: "Mobile" },
  { key: "email", label: "Email" },
  { key: "university", label: "University" },
  { key: "course", label: "Course" },
  { key: "lead_no", label: "Lead No", sort: "lead_no" },
  { key: "stage", label: "Stage" },
  { key: "subStage", label: "Sub Stage" },
  { key: "source", label: "Source" },
  { key: "owner", label: "Lead Owner" },
  { key: "attempts", label: "Attempts", sort: "attempt_count" },
  { key: "followup", label: "Next Followup", sort: "next_followup_at" },
  { key: "priority", label: "Priority", hidden: true },
  { key: "product", label: "Product", hidden: true },
  { key: "city", label: "City", hidden: true },
  { key: "created", label: "Created", sort: "created_at" },
];
const STORE = "lead-list-columns";
const STORE_EVENT = "lead-list-columns-changed";
const DEFAULT_HIDDEN = JSON.stringify(COLUMNS.filter((c) => c.hidden).map((c) => c.key));

// The hidden-column choice lives in localStorage; reading it through an external store keeps
// server and first client render identical (defaults) and avoids a hydration mismatch.
function subscribeColumns(notify: () => void) {
  window.addEventListener(STORE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(STORE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}
function readColumns() {
  try {
    return localStorage.getItem(STORE) ?? DEFAULT_HIDDEN;
  } catch {
    return DEFAULT_HIDDEN;
  }
}
const PRIORITY_COLOR: Record<string, string> = { hot: "#dc2626", warm: "#d97706", cold: "#0284c7" };

export function LeadTable({ rows, params, role, stages, users }: { rows: LeadRow[]; params: Record<string, string | undefined>; role: Role; stages: Opt[]; users: Opt[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hiddenJson = useSyncExternalStore(subscribeColumns, readColumns, () => DEFAULT_HIDDEN);
  const hidden = useMemo(() => {
    try {
      return new Set<string>(JSON.parse(hiddenJson));
    } catch {
      return new Set<string>(JSON.parse(DEFAULT_HIDDEN));
    }
  }, [hiddenJson]);
  const [showCols, setShowCols] = useState(false);
  const [colSearch, setColSearch] = useState("");
  const [pending, start] = useTransition();
  // deleting is irreversible, so it always goes through an explicit confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  // selection only makes sense for the rows currently on screen
  const [seenRows, setSeenRows] = useState(rows);
  if (seenRows !== rows) {
    setSeenRows(rows);
    setSelected(new Set());
  }

  function toggleCol(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    try {
      localStorage.setItem(STORE, JSON.stringify([...next]));
      window.dispatchEvent(new Event(STORE_EVENT));
    } catch {}
  }

  const href = (changes: Record<string, string>) => {
    const sp = new URLSearchParams();
    Object.entries({ ...params, ...changes }).forEach(([k, v]) => v && sp.set(k, v));
    return `/leads?${sp}`;
  };
  const sortHref = (col: string) => href({ sort: col, dir: params.sort === col && params.dir !== "asc" ? "asc" : "desc" });

  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    start(async () => {
      if (notify(await fn())) setSelected(new Set());
    });

  const ids = [...selected];
  const cols = COLUMNS.filter((c) => !hidden.has(c.key));
  const allChecked = rows.length > 0 && selected.size === rows.length;
  const isStaff = role !== "agent";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        {selected.size > 0 ? (
          <>
            <span className="font-bold">{selected.size} selected</span>
            <Select aria-label="Move selected to stage" options={stages} placeholder="Move to stage..." value="" disabled={pending} className="!h-9 !w-44" onChange={(e) => e.target.value && run(() => bulkStage(ids, e.target.value))} />
            {isStaff && (
              <Select
                aria-label="Assign selected leads"
                options={[{ value: "none", label: "Unassign" }, ...users]}
                placeholder="Assign to..."
                value=""
                disabled={pending}
                className="!h-9 !w-52"
                onChange={(e) => e.target.value && run(() => assignLeads(ids, e.target.value === "none" ? null : e.target.value))}
              />
            )}
            {role === "admin" && (
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </>
        ) : (
          <span className="text-muted">Select rows for bulk actions</span>
        )}

        <div className="relative ml-auto flex items-center gap-2">
          <Select
            aria-label="Rows per page"
            options={[25, 50, 100].map((n) => ({ value: String(n), label: `${n} rows` }))}
            placeholder={null}
            value={params.size ?? "50"}
            className="!h-9 !w-28"
            onChange={(e) => router.push(href({ size: e.target.value, page: "1" }))}
          />
          <Button variant="ghost" aria-label="Refresh" title="Refresh" onClick={() => router.refresh()}>
            <RefreshCw size={16} />
          </Button>
          <Button variant="ghost" aria-label="Choose columns" title="Choose columns" onClick={() => setShowCols((s) => !s)}>
            <Columns3 size={16} />
          </Button>
          {showCols && (
            <div className="absolute right-0 top-11 z-20 w-56 rounded-md border border-line bg-card p-2 shadow-xl">
              <input value={colSearch} onChange={(e) => setColSearch(e.target.value)} placeholder="Find Column..." aria-label="Find column" className="input mb-2 !h-8" />
              <div className="max-h-64 overflow-y-auto">
                {COLUMNS.filter((c) => c.label.toLowerCase().includes(colSearch.toLowerCase())).map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-soft">
                    <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleCol(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <Modal title="Delete leads" onClose={() => setConfirmDelete(false)}>
          <p>
            Delete <b>{ids.length}</b> lead(s) and all their history (calls, follow-ups, messages, enrolments)? This cannot be undone.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                setConfirmDelete(false);
                run(() => deleteLeads(ids));
              }}
            >
              Yes, delete
            </Button>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}

      <div className="max-h-[calc(100vh-320px)] min-h-64 overflow-auto">
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>
              <th className="w-10">
                <input type="checkbox" aria-label="Select all rows" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))} />
              </th>
              <th className="w-10" />
              {cols.map((c) => (
                <th key={c.key}>
                  {c.sort ? (
                    <Link href={sortHref(c.sort)} className="inline-flex items-center gap-1">
                      {c.label}
                      {params.sort === c.sort ? params.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} className="opacity-40" />}
                    </Link>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn(selected.has(r.id) && "bg-soft")}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    checked={selected.has(r.id)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      setSelected(next);
                    }}
                  />
                </td>
                <td>
                  <Link href={`/leads/${r.id}`} aria-label={`Edit ${r.name}`} className="text-brand">
                    <SquarePen size={16} />
                  </Link>
                </td>
                {cols.map((c) => (
                  <td key={c.key}>
                    {c.key === "name" ? (
                      <Link href={`/leads/${r.id}`} className="font-semibold hover:text-brand">
                        {r.name}
                      </Link>
                    ) : c.key === "stage" && r.stage ? (
                      <Badge color={r.stageColor}>{r.stage}</Badge>
                    ) : c.key === "priority" ? (
                      <Badge color={PRIORITY_COLOR[r.priority]}>{r.priority}</Badge>
                    ) : c.key === "followup" ? (
                      <span className={cn(r.overdue && "font-bold text-red-600")}>{r.followup}</span>
                    ) : (
                      String(r[c.key])
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No leads match these filters.</Empty>}
      </div>
    </div>
  );
}
