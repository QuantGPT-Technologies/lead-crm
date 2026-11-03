"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
export function TableSort({ options, defaultSort, defaultAsc = false }: { options: { value: string; label: string }[]; defaultSort: string; defaultAsc?: boolean }) {
  const router = useRouter(), path = usePathname(), search = useSearchParams();
  const apply = (key: string, value: string) => { const next = new URLSearchParams(search.toString()); next.set(key, value); next.delete("page"); router.push(`${path}?${next}`); };
  return <div className="mb-3 flex gap-2"><select aria-label="Sort table" value={search.get("sort") ?? defaultSort} onChange={event => apply("sort", event.target.value)} className="input !h-9 !w-auto">{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select aria-label="Sort direction" value={search.get("dir") ?? (defaultAsc ? "asc" : "desc")} onChange={event => apply("dir", event.target.value)} className="input !h-9 !w-auto"><option value="asc">Ascending</option><option value="desc">Descending</option></select></div>;
}
