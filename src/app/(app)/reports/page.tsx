import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { allReportRows, reportId, reportRange } from "@/lib/report-data";
import { Card, PageHeader, Select, btn } from "@/components/ui";
import { DateFilter } from "@/components/date-filter";
import { ReportTable } from "@/components/report-table";
import { one, toCsv, type SearchParams } from "@/lib/utils";
import { viewHref } from "@/lib/view-filters";
const DIMENSIONS = [["stage", "Status"], ["sub_stage", "Sub-status"], ["source", "Source"], ["attempt", "Attempts"], ["owner", "Employee"], ["university", "University"], ["course", "Program"], ["city", "City"], ["priority", "Priority"], ["category", "Category"], ["rechurn", "Rechurn"]];
interface Row { label: string; total: number; attempts: number; calls: number; contacted: number; enrolled: number; lost: number; statuses: Record<string, number> }
export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin", "manager");
  const lookups = await getLookups();
  const range = reportRange(sp);
  const dim = DIMENSIONS.some(([key]) => key === one(sp.by)) ? one(sp.by)! : "stage";
  const filters = Object.fromEntries(["owner", "source", "stage", "attempt", "churn"].map(key => [key, one(sp[key])]));
  const { rows, error } = await allReportRows<Row>(supabase, "crm_lead_report", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_dim: dim, p_owner: reportId(filters.owner), p_source: reportId(filters.source), p_stage: reportId(filters.stage), p_attempt: filters.attempt ?? "", p_churn: filters.churn ?? "" });
  const statuses = [...new Set([...lookups.stages.map(stage => stage.name), ...rows.flatMap(row => Object.keys(row.statuses ?? {}))])];
  const label = DIMENSIONS.find(([key]) => key === dim)![1];
  const records: Record<string, string | number>[] = rows.map(row => ({ [label]: row.label, Leads: Number(row.total), Attempts: Number(row.attempts), Calls: Number(row.calls), Contacted: Number(row.contacted), Enrolled: Number(row.enrolled), Lost: Number(row.lost), ...Object.fromEntries(statuses.map(status => [`Status: ${status}`, Number(row.statuses?.[status] ?? 0)])) }));
  const columns = [label, "Leads", "Attempts", "Calls", "Contacted", "Enrolled", "Lost", ...statuses.map(status => `Status: ${status}`)];
  const params = { ...filters, by: dim, from: range.fromStr, to: range.toStr };
  return <>
    <PageHeader title="Lead reports">{!error && records.length > 0 && <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(records))}`} download={`lead-report-${range.fromStr}-${range.toStr}.csv`} className={btn("outline")}>Export CSV</a>}<Link href={viewHref("/reports/agents", params)} className={btn("outline")}>Employee report</Link></PageHeader>
    <DateFilter label="Lead creation dates" allowAll={false} defaults={{ from: range.fromStr, to: range.toStr }} />
    <form className="mb-4 flex flex-wrap gap-2"><input type="hidden" name="by" value={dim} /><input type="hidden" name="from" value={range.fromStr} /><input type="hidden" name="to" value={range.toStr} />
      <Select name="owner" aria-label="Employee" defaultValue={filters.owner ?? ""} options={lookups.users.map(user => ({ value: user.id, label: user.full_name }))} placeholder="All employees" className="!w-44" />
      <Select name="source" aria-label="Source" defaultValue={filters.source ?? ""} options={lookups.sources.map(source => ({ value: source.id, label: source.name }))} placeholder="All sources" className="!w-44" />
      <Select name="stage" aria-label="Status" defaultValue={filters.stage ?? ""} options={lookups.stages.map(stage => ({ value: stage.id, label: stage.name }))} placeholder="All statuses" className="!w-44" />
      <Select name="attempt" aria-label="Attempts" defaultValue={filters.attempt ?? ""} options={["0", "1", "2", "3+"].map(value => ({ value, label: `${value} attempts` }))} placeholder="All attempts" className="!w-40" />
      <Select name="churn" aria-label="Rechurn" defaultValue={filters.churn ?? ""} options={[{ value: "yes", label: "Rechurned" }, { value: "no", label: "Never rechurned" }]} placeholder="All rechurn states" className="!w-44" />
      <button className={btn("outline")}>Apply filters</button>
    </form>
    <div className="mb-4 flex flex-wrap gap-2">{DIMENSIONS.map(([key, title]) => <Link key={key} href={viewHref("/reports", { ...params, by: key })} className={btn(dim === key ? "primary" : "outline")}>By {title}</Link>)}</div>
    {!error && <p className="mb-3 text-xs text-muted">{rows.reduce((sum, row) => sum + Number(row.total), 0)} leads. Current statuses and lifetime calls/attempts for leads created in the selected period. Click a column heading to sort.</p>}
    {error ? <Card className="p-4 text-red-600">{error}</Card> : <Card><ReportTable columns={columns} rows={records} /></Card>}
  </>;
}
