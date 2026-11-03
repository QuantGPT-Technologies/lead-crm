"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { periodDates } from "@/lib/view-filters";

export function DateFilter({ label = "Date", field = false, allowAll = true, defaults }: { label?: string; field?: boolean; allowAll?: boolean; defaults?: { from: string; to: string } }) {
  const pathname = usePathname();
  const current = useSearchParams();
  const router = useRouter();
  const apply = (changes: Record<string, string>) => {
    const next = new URLSearchParams(current.toString());
    next.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    router.push(`${pathname}?${next}`);
  };
  return <form className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-card p-3" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    apply({ from: String(data.get("from") ?? ""), to: String(data.get("to") ?? ""), ...(field ? { dateField: String(data.get("dateField")) } : {}) });
  }} key={`${current.get("from")}:${current.get("to")}:${current.get("dateField")}`}>
    <span className="self-center text-xs font-semibold">{label}</span>
    {field && <select name="dateField" defaultValue={current.get("dateField") ?? "created_at"} aria-label="Date field" className="input !h-9 !w-auto">
      <option value="created_at">Lead created</option><option value="last_attempt_at">Last attempt</option><option value="next_followup_at">Next follow-up</option><option value="last_rechurned_at">Last rechurn</option><option value="allotted_at">Allotted</option>
    </select>}
    <label className="text-xs">From<input type="date" name="from" aria-label={`${label} from`} defaultValue={current.get("from") ?? defaults?.from ?? ""} className="input !h-9 !w-40" /></label>
    <label className="text-xs">To<input type="date" name="to" aria-label={`${label} to`} defaultValue={current.get("to") ?? defaults?.to ?? ""} min={current.get("from") ?? undefined} className="input !h-9 !w-40" /></label>
    <button className="rounded-lg border border-line px-3 py-2 text-xs">Apply dates</button>
    {[['day', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([key, name]) => <button key={key} type="button" className="rounded-lg border border-line px-3 py-2 text-xs" onClick={() => apply(periodDates(key))}>{name}</button>)}
    {allowAll && <button type="button" className="px-2 py-2 text-xs text-muted" onClick={() => apply({ from: "", to: "", dates: "all" })}>All dates</button>}
  </form>;
}
