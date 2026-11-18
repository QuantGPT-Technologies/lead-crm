/** Fields the pivot report can group by. Keys must match crm_pivot_key() in upgrade-015. */
export const PIVOT_FIELDS = [
  { key: "attempt", label: "Attempts" },
  { key: "created_day", label: "Created date" },
  { key: "stage", label: "Stage" },
  { key: "sub_stage", label: "Sub stage" },
  { key: "remark", label: "Remark" },
  { key: "calls", label: "Calls" },
  { key: "created_month", label: "Created month" },
  { key: "activity_day", label: "Last update date" },
  { key: "followup_day", label: "Follow-up date" },
  { key: "owner", label: "Employee" },
  { key: "source", label: "Source" },
  { key: "partner", label: "Partner" },
  { key: "university", label: "University" },
  { key: "course", label: "Course" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "priority", label: "Priority" },
  { key: "category", label: "Category" },
  { key: "rechurn", label: "Rechurn" },
  { key: "dnd", label: "Do not disturb" },
] as const;

export type PivotField = (typeof PIVOT_FIELDS)[number]["key"];

/** Rows plus columns together. More than this makes an unreadable table. */
export const MAX_PIVOT_FIELDS = 6;

export const isPivotField = (v: string): v is PivotField => PIVOT_FIELDS.some((f) => f.key === v);

export const pivotFieldLabel = (key: string) => PIVOT_FIELDS.find((f) => f.key === key)?.label ?? key;

/** Parses "stage,attempt" from the URL, dropping unknown or repeated fields. */
export function parsePivotFields(value: string | undefined, taken: string[] = []): PivotField[] {
  const out: PivotField[] = [];
  for (const part of (value ?? "").split(",")) {
    if (isPivotField(part) && !out.includes(part) && !taken.includes(part)) out.push(part);
  }
  return out;
}

/** Display names and sort position for each value of each field in the result. */
export type PivotValues = Record<string, Record<string, { label: string; rank: number; color?: string }>>;

export interface PivotCell { keys: string[]; n: number }

export interface PivotLeadRow {
  id: string; lead_no: string; student_name: string; mobile: string; city: string | null; state: string | null;
  attempt_count: number; created_at: string; remarks: string | null; product: string | null;
  stage: { name: string; color: string } | null; sub_stage: { name: string } | null;
  course: { name: string } | null; owner: { full_name: string } | null;
}

/** Field -> allowed values. A lead must match one allowed value for every listed field. */
export type PivotFilters = Record<string, string[]>;

/** One value a field can take in the current period, for the filter picker. */
export interface PivotOption { key: string; label: string; n: number; color?: string }
