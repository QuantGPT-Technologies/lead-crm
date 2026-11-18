import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Card, btn } from "@/components/ui";
import { DateFilter } from "@/components/date-filter";
import { reportRange } from "@/lib/report-data";
import { MAX_PIVOT_FIELDS, parsePivotFields } from "@/lib/pivot";
import { cleanPivotFilters, loadPivotData } from "@/lib/pivot-server";
import { one, type SearchParams } from "@/lib/utils";
import { PivotBuilder } from "./pivot-builder";

export default async function PivotReportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin", "manager");
  const range = reportRange(sp);
  // One "Group by" list. Older links with columns fold them into it.
  const rows = parsePivotFields([one(sp.rows), one(sp.cols)].filter(Boolean).join(",")).slice(0, MAX_PIVOT_FIELDS);
  const cols: string[] = [];
  const filters = cleanPivotFilters(one(sp.filters));
  const data = await loadPivotData(supabase, range, rows, cols, filters);

  // On desktop the page fills the window exactly (window minus top bar and page padding);
  // only the field list and the table scroll inside it.
  return (
    <div className="-mt-3 lg:-mt-5 lg:flex lg:h-[calc(100dvh-76px-44px)] lg:flex-col min-[1600px]:-mt-7 min-[1600px]:h-[calc(100dvh-76px-52px)]">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold leading-tight">Pivot report</h1>
        <DateFilter label="Created" allowAll={false} defaults={{ from: range.fromStr, to: range.toStr }} className="mb-0 flex-1 items-center px-3 py-2" />
        <Link href="/reports" className={btn("ghost", "h-8 px-3")}>Lead reports</Link>
      </div>
      {"error" in data && data.error
        ? <Card className="p-4 text-red-600">{data.error}</Card>
        : <div className="lg:min-h-0 lg:flex-1"><PivotBuilder key={`${range.fromStr}|${range.toStr}`} initial={{ rows, cols, filters, cells: data.cells ?? [], values: data.values ?? {}, filterValues: data.filterValues ?? {} }} from={range.fromStr} to={range.toStr} /></div>}
    </div>
  );
}
