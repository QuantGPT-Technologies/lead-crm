"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  RefreshCw,
  SquarePen,
  Zap,
} from "lucide-react";
import { QuickUpdate, type QuickStage, type QuickSubStage } from "./quick-update";
import { useHoverPrefetch } from "@/components/hover-prefetch";
import { Badge, Button, Empty, Modal, Select } from "@/components/ui";
import { notify } from "@/components/toast";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { bulkAssignLeads, bulkStage, deleteLeads, moveCategory } from "./actions";
import { CATEGORY_OPTIONS } from "@/lib/lead-categories";

export interface LeadRow {
  id: string;
  lead_no: string;
  name: string;
  mobile: string;
  email: string;
  university: string;
  course: string;
  stage: string;
  stageColor: string;
  subStage: string;
  subStageColor: string;
  source: string;
  owner: string;
  product: string;
  city: string;
  priority: string;
  priorityDescription?: string;
  category: string;
  attempts: number;
  calls: number;
  lastAttempt: string;
  followup: string;
  overdue: boolean;
  created: string;
  stageId: string | null;
  subStageId: string | null;
  otherText: string;
  remark: string;
  lastUpdate: string;
  lastUpdateAt: string;
  /** Transferred to someone else: still visible to its primary owner, but read-only. */
  viewOnly: boolean;
}

type Opt = { value: string; label: string };

const COLUMNS: {
  key: keyof LeadRow;
  label: string;
  sort?: string;
  hidden?: boolean;
}[] = [
  { key: "name", label: "Student Name", sort: "student_name" },
  { key: "priority", label: "Priority" },
  { key: "mobile", label: "Mobile" },
  { key: "email", label: "Email" },
  { key: "university", label: "University" },
  { key: "course", label: "Course" },
  { key: "lead_no", label: "Lead No", sort: "lead_no" },
  { key: "stage", label: "Stage" },
    { key: "category", label: "Category" },
  { key: "subStage", label: "Sub Stage" },
  { key: "remark", label: "Remark" },
  { key: "lastUpdate", label: "Last update", sort: "last_activity_at" },
  { key: "source", label: "Source" },
  { key: "owner", label: "Lead Owner" },
  { key: "attempts", label: "Attempts", sort: "attempt_count" },
  { key: "calls", label: "Total calls", sort: "total_calls" },
  { key: "lastAttempt", label: "Last attempt", sort: "last_attempt_at" },
  { key: "followup", label: "Next Followup", sort: "next_followup_at" },
  { key: "product", label: "Product", hidden: true },
  { key: "city", label: "City", hidden: true },
  { key: "created", label: "Created", sort: "created_at" },
];
const STORE = "lead-list-columns-v3";
const STORE_EVENT = "lead-list-columns-changed";
const DEFAULT_HIDDEN = JSON.stringify(
  COLUMNS.filter(
    (c) =>
      ![
        "name",
        "mobile",
        "course",
        "stage",
        "subStage",
        "remark",
        "lastUpdate",
          "category",
        "owner",
        "followup",
        "attempts",
        "calls",
        "lastAttempt",
        "priority",
      ].includes(c.key),
  ).map((c) => c.key),
);

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
const PRIORITY_COLOR: Record<string, string> = {
  other: "#64748b",
  hot: "#dc2626",
  warm: "#d97706",
  cold: "#0284c7",
};

export function LeadTable({
  rows,
  params,
  role,
  stages,
  users,
  stageList,
  subStages,
}: {
  rows: LeadRow[];
  params: Record<string, string | undefined>;
  role: Role;
  stages: Opt[];
  users: Opt[];
  stageList: QuickStage[];
  subStages: QuickSubStage[];
}) {
  const router = useRouter();
  const hoverPrefetch = useHoverPrefetch();
  const [quick, setQuick] = useState<LeadRow | null>(null);
  const editable = (r: LeadRow) => !r.viewOnly;
  const quickCell = (r: LeadRow, content: React.ReactNode, emptyText: string) =>
    editable(r) ? (
      <button type="button" onClick={() => setQuick(r)} title="Click to update stage, sub stage or remark"
        className="group/q max-w-[260px] rounded-md px-1 py-0.5 text-left hover:bg-soft">
        {content || <span className="text-xs text-muted group-hover/q:text-brand">{emptyText}</span>}
      </button>
    ) : content;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hiddenJson = useSyncExternalStore(
    subscribeColumns,
    readColumns,
    () => DEFAULT_HIDDEN,
  );
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
    Object.entries({ ...params, ...changes }).forEach(
      ([k, v]) => v && sp.set(k, v),
    );
    return `/leads?${sp}`;
  };
  const sortHref = (col: string) =>
    href({
      sort: col,
      dir: params.sort === col && params.dir !== "asc" ? "asc" : "desc",
    });

  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    start(async () => {
      if (notify(await fn())) setSelected(new Set());
    });

  const ids = [...selected];
  const cols = COLUMNS.filter((c) => !hidden.has(c.key));
  const allChecked = rows.length > 0 && selected.size === rows.length;
  const isStaff = role !== "agent";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        {selected.size > 0 ? (
          <>
            <span className="font-bold">{selected.size} selected</span>
            <Select
              aria-label="Move selected to stage"
              options={stages}
              placeholder="Move to stage..."
              value=""
              disabled={pending}
              className="!h-9 !w-44"
              onChange={(e) =>
                e.target.value && run(() => bulkStage(ids, e.target.value))
              }
            />
            {isStaff && params.owner === "none" && (
              <Select
                aria-label="Assign selected leads"
                options={users}
                placeholder="Assign to..."
                value=""
                disabled={pending}
                className="!h-9 !w-52"
                onChange={(e) =>
                  e.target.value &&
                  run(() =>
                    bulkAssignLeads(ids, e.target.value),
                  )
                }
              />
            )}
            {isStaff && params.owner !== "none" && (
              <Link href={href({ owner: "none", page: "1" })} className="text-xs font-bold text-brand">
                Bulk assign unassigned leads
              </Link>
            )}
            {role === "admin" && (
                <Select
                  aria-label="Move selected leads to category"
                  options={[...CATEGORY_OPTIONS, { value: "none", label: "Uncategorized" }]}
                  placeholder="Move to category..."
                  value=""
                  disabled={pending}
                  className="!h-9 !w-44"
                  onChange={(e) => e.target.value && run(() => moveCategory(ids, e.target.value === "none" ? null : e.target.value))}
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
          <span className="text-xs text-muted">
            {rows.length} leads on this page · Select to manage together
          </span>
        )}

        <div className="relative ml-auto flex items-center gap-2">
          <Select aria-label="Sort leads" value={params.sort ?? "created_at"} placeholder={null}
            options={COLUMNS.filter(column => column.sort).map(column => ({ value: column.sort!, label: column.label }))}
            onChange={event => router.push(href({ sort: event.target.value, page: "1" }))} className="!h-9 !w-44" />
          <Select aria-label="Sort direction" value={params.dir ?? "desc"} placeholder={null}
            options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]}
            onChange={event => router.push(href({ dir: event.target.value, page: "1" }))} className="!h-9 !w-32" />
          <Select
            aria-label="Rows per page"
            options={[25, 50, 100].map((n) => ({
              value: String(n),
              label: `${n} rows`,
            }))}
            placeholder={null}
            value={params.size ?? "50"}
            className="!h-9 !w-28"
            onChange={(e) =>
              router.push(href({ size: e.target.value, page: "1" }))
            }
          />
          <Button
            variant="ghost"
            aria-label="Refresh"
            title="Refresh"
            onClick={() => router.refresh()}
          >
            <RefreshCw size={16} />
          </Button>
          <Button
            variant="ghost"
            aria-label="Choose columns"
            title="Choose columns"
            onClick={() => setShowCols((s) => !s)}
          >
            <Columns3 size={16} />
          </Button>
          {showCols && (
            <div className="absolute right-0 top-11 z-20 w-56 rounded-md border border-line bg-card p-2 shadow-xl">
              <input
                value={colSearch}
                onChange={(e) => setColSearch(e.target.value)}
                placeholder="Find Column..."
                aria-label="Find column"
                className="input mb-2 !h-8"
              />
              <div className="max-h-64 overflow-y-auto">
                {COLUMNS.filter((c) =>
                  c.label.toLowerCase().includes(colSearch.toLowerCase()),
                ).map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-soft"
                  >
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.key)}
                      onChange={() => toggleCol(c.key)}
                    />
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
            Delete <b>{ids.length}</b> lead(s) and all their history (calls,
            follow-ups, messages, enrolments)? This cannot be undone.
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

      <div className="max-h-[70vh] min-h-64 flex-1 overflow-auto lg:max-h-none lg:min-h-0">
        <table className="table-grid lead-grid w-full border-collapse">
          <thead>
            <tr>
              <th className="lead-pin-1">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  checked={allChecked}
                  onChange={() =>
                    setSelected(
                      allChecked ? new Set() : new Set(rows.map((r) => r.id)),
                    )
                  }
                />
              </th>
              <th className="lead-pin-2" />
              {cols.map((c) => (
                <th key={c.key} className={c.key === "name" ? "lead-pin-3" : undefined}>
                  {c.sort ? (
                    <Link
                      href={sortHref(c.sort)}
                      className="inline-flex items-center gap-1"
                    >
                      {c.label}
                      {params.sort === c.sort ? (
                        params.dir === "asc" ? (
                          <ArrowUp size={13} />
                        ) : (
                          <ArrowDown size={13} />
                        )
                      ) : (
                        <ArrowUpDown size={13} className="opacity-40" />
                      )}
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
              <tr key={r.id} className={cn(selected.has(r.id) && "is-selected")}>
                <td className="lead-pin-1">
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
                <td className="lead-pin-2">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/leads/${r.id}?returnTo=${encodeURIComponent(href({}))}`}
                      {...hoverPrefetch(`/leads/${r.id}?returnTo=${encodeURIComponent(href({}))}`)}
                      aria-label={`Open ${r.name}`}
                      title="Open lead"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:border-brand hover:text-brand"
                    >
                      <SquarePen size={14} />
                    </Link>
                    {editable(r) && (
                      <button type="button" onClick={() => setQuick(r)} aria-label={`Quick update ${r.name}`} title="Quick update: stage, sub stage, remark"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-brand/10 text-brand hover:bg-brand hover:text-white dark:hover:text-bg">
                        <Zap size={14} fill="currentColor" />
                      </button>
                    )}
                  </div>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className={c.key === "name" ? "lead-pin-3" : undefined}>
                    {c.key === "name" ? (
                      <Link
                        href={`/leads/${r.id}?returnTo=${encodeURIComponent(href({}))}`}
                      {...hoverPrefetch(`/leads/${r.id}?returnTo=${encodeURIComponent(href({}))}`)}
                        className="lead-identity font-semibold hover:text-brand"
                      >
                        <span className="lead-avatar">
                          {r.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <span>
                          {r.name}
                          <span className="mt-1 block text-[10px] font-normal text-muted">
                            {r.lead_no}
                          </span>
                        </span>
                      </Link>
                    ) : c.key === "stage" ? (
                      quickCell(r, r.stage ? <Badge color={r.stageColor}>{r.stage}</Badge> : null, "Set stage")
                    ) : c.key === "priority" ? (
                      <Badge color={PRIORITY_COLOR[r.priority]}>
                        {r.priorityDescription || r.priority}
                      </Badge>
                    ) : c.key === "subStage" ? (
                      quickCell(r, r.subStage ? <Badge color={r.subStageColor}>{r.subStage}</Badge> : null, "Set sub stage")
                    ) : c.key === "remark" ? (
                      quickCell(r, r.remark ? <span className="line-clamp-2 text-xs" title={r.remark}>{r.remark}</span> : null, "+ Add remark")
                    ) : c.key === "lastUpdate" ? (
                      r.lastUpdate ? (
                        <span className="block max-w-[280px]">
                          <span className="line-clamp-2 text-xs" title={r.lastUpdate}>{r.lastUpdate}</span>
                          <span className="block text-[10px] text-muted">{r.lastUpdateAt}</span>
                        </span>
                      ) : <span className="text-xs text-muted">No activity yet</span>
                    ) : c.key === "owner" && r.viewOnly ? (
                      <span>{r.owner}<span className="mt-0.5 block text-[10px] font-semibold text-amber-600">Transferred · view only</span></span>
                    ) : c.key === "followup" ? (
                      <span
                        className={cn(r.overdue && "font-bold text-red-600")}
                      >
                        {r.followup}
                      </span>
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
        {quick && (
          <QuickUpdate onClose={() => setQuick(null)} stages={stageList} subStages={subStages}
            lead={{ id: quick.id, name: quick.name, stageId: quick.stageId, subStageId: quick.subStageId, otherText: quick.otherText, remark: quick.remark }} />
        )}
      </div>
    </div>
  );
}
