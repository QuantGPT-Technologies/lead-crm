import Link from "next/link";
import { Download } from "lucide-react";
import { getSession } from "@/lib/auth";
import { Card, Empty, PageHeader, btn } from "@/components/ui";
import { dateRange, one, toCsv, type SearchParams } from "@/lib/utils";

const DIMENSIONS = [["stage", "Stage"], ["source", "Source"], ["owner", "Lead Owner"], ["university", "University"], ["city", "City"]] as const;

interface ReportRow {
  label: string; total: number; contacted: number; enrolled: number; lost: number;
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await getSession();
  const dim = DIMENSIONS.some(([d]) => d === one(sp.by)) ? one(sp.by)! : "stage";
  const range = dateRange(one(sp.from), one(sp.to), 30);

  const { data, error } = await supabase.rpc("report_leads_by", { p_dim: dim, p_from: range.from.toISOString(), p_to: range.to.toISOString() });
  const rows = ((data ?? []) as ReportRow[]).map((r) => ({ ...r, total: Number(r.total), contacted: Number(r.contacted), enrolled: Number(r.enrolled), lost: Number(r.lost) }));
  const sum = (k: keyof Omit<ReportRow, "label">) => rows.reduce((s, r) => s + r[k], 0);
  const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "0%");
  const label = DIMENSIONS.find(([d]) => d === dim)![1];
  const max = Math.max(1, ...rows.map((r) => r.total));
  const csv = toCsv(rows.map((r) => ({ [label]: r.label, Leads: r.total, Contacted: r.contacted, Enrolled: r.enrolled, Lost: r.lost, "Conversion %": pct(r.enrolled, r.total) })));
  const qs = `from=${range.fromStr}&to=${range.toStr}`;

  return (
    <>
      <PageHeader title="Lead Reports">
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="by" value={dim} />
          <input type="date" name="from" defaultValue={range.fromStr} aria-label="From date" className="input !h-9 !w-40" />
          <input type="date" name="to" defaultValue={range.toStr} aria-label="To date" className="input !h-9 !w-40" />
          <button type="submit" className={btn("outline")}>
            Apply
          </button>
        </form>
        {rows.length > 0 && (
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download={`leads-by-${dim}-${range.fromStr}-to-${range.toStr}.csv`} className={btn("success")}>
            <Download size={15} /> CSV
          </a>
        )}
      </PageHeader>

      <div className="mb-3 flex flex-wrap gap-2">
        {DIMENSIONS.map(([d, l]) => (
          <Link key={d} href={`/reports?by=${d}&${qs}`} className={btn(d === dim ? "primary" : "outline")}>
            By {l}
          </Link>
        ))}
      </div>

      <Card className="overflow-x-auto">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{[label, "Leads created", "", "Contacted", "Enrolled", "Lost", "Conversion"].map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="font-semibold">{r.label}</td>
                <td>{r.total}</td>
                <td className="w-1/3">
                  <div className="h-2.5 rounded bg-brand" style={{ width: `${(r.total / max) * 100}%` }} role="img" aria-label={`${r.total} leads`} />
                </td>
                <td>{r.contacted}</td>
                <td className="font-bold text-emerald-600">{r.enrolled}</td>
                <td className="text-red-600">{r.lost}</td>
                <td>{pct(r.enrolled, r.total)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="font-extrabold">
                <td>Total</td>
                <td>{sum("total")}</td>
                <td />
                <td>{sum("contacted")}</td>
                <td>{sum("enrolled")}</td>
                <td>{sum("lost")}</td>
                <td>{pct(sum("enrolled"), sum("total"))}</td>
              </tr>
            )}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No leads were created in this period.</Empty>}
      </Card>
      <p className="mt-2 text-xs text-muted">Counts leads created in the selected period, grouped by their current {label.toLowerCase()}. You only see leads you have access to.</p>
    </>
  );
}
