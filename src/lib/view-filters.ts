import { addDays, isDateString, startOfDay, tzDateString } from "@/lib/utils";

export const LEAD_SORTS = ["created_at", "student_name", "attempt_count", "total_calls", "last_attempt_at", "next_followup_at", "lead_no", "updated_at", "rechurn_count"];
export const LEAD_DATE_FIELDS = ["created_at", "last_attempt_at", "next_followup_at", "last_rechurned_at", "allotted_at"];
export function tableSort(sort: string | undefined, direction: string | undefined, allowed: string[], defaultSort: string, defaultAsc = false) {
  return { column: sort && allowed.includes(sort) ? sort : defaultSort, ascending: direction === "asc" || (!direction && defaultAsc) };
}

/** Cursor navigation matches the list's sort, including equal values and nulls last. */
export function leadNeighbor(sort: string, value: unknown, id: string, ascending: boolean, following: boolean) {
  const field = LEAD_SORTS.includes(sort) ? sort : "created_at";
  const op = ascending === following ? "gt" : "lt";
  const sameValue = value == null ? `${field}.is.null` : `${field}.eq.${JSON.stringify(String(value))}`;
  const tie = `and(${sameValue},id.${op}.${id})`;
  const other = value == null ? following ? "" : `${field}.not.is.null` : `${field}.${op}.${JSON.stringify(String(value))}`;
  const nulls = value != null && following ? `${field}.is.null` : "";
  return { expression: [tie, other, nulls].filter(Boolean).join(","), ascending: following ? ascending : !ascending, nullsFirst: !following };
}

// All date ranges use the company timezone, with an inclusive end date.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function filterDates<Q extends { gte: any; lt: any }>(query: Q, from?: string, to?: string, column = "created_at"): Q {
  let result = query;
  if (isDateString(from)) result = result.gte(column, startOfDay(from).toISOString());
  if (isDateString(to)) result = result.lt(column, addDays(startOfDay(to), 1).toISOString());
  return result;
}

export function periodDates(period: string, now = new Date()) {
  const today = tzDateString(now);
  const date = startOfDay(today);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  const from = period === "week" ? tzDateString(addDays(date, -((day + 6) % 7)))
    : period === "month" ? `${today.slice(0, 7)}-01` : today;
  return { from, to: today };
}

export function viewHref(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value && search.set(key, value));
  return search.size ? `${path}?${search}` : path;
}
