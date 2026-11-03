import { requireRole } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { allReportRows, reportId, reportRange } from "@/lib/report-data";
import { Card, PageHeader, Select, btn } from "@/components/ui";
import { DateFilter } from "@/components/date-filter";
import { ReportTable } from "@/components/report-table";
import { one, toCsv, type SearchParams } from "@/lib/utils";
import { env } from "@/lib/env";
import { summarizeEmployees, hasEmployeeActivity, type EmployeeReportRow } from "@/lib/employee-report";
export default async function AgentReportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin", "manager");
  const lookups = await getLookups();
  const range = reportRange(sp);
  const view = ["summary", "day", "week", "month"].includes(one(sp.view) ?? "") ? one(sp.view)! : "summary";
  const summary = view === "summary";
  // Monthly buckets minimize empty rows transferred for a range summary.
  const period = summary ? "month" : view;
  const { rows: buckets, error } = await allReportRows<EmployeeReportRow>(supabase, "crm_employee_report", { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_period: period, p_tz: env.timezone, p_owner: reportId(one(sp.owner)), p_source: reportId(one(sp.source)), p_stage: reportId(one(sp.stage)) });
  const showEmpty = one(sp.empty) === "1";
  const rows = summary ? summarizeEmployees(buckets) : showEmpty ? buckets : buckets.filter(hasEmployeeActivity);
  const statuses = [...new Set([...lookups.stages.map(stage => stage.name), ...rows.flatMap(row => Object.keys(row.statuses ?? {}))])];
  const columns = [...(summary ? [] : ["Period starting"]), "Employee", "Employee ID", "Leads allotted", "Attempts", "Calls", "Connected", "Talk time (seconds)", "Follow-ups done", "Enrolled", "Collected", ...statuses.map(status => `Status: ${status}`)];
  const records: Record<string, string | number>[] = rows.map(row => ({ ...(summary ? {} : { "Period starting": row.period }), Employee: row.agent, "Employee ID": row.emp_code, "Leads allotted": Number(row.leads), Attempts: Number(row.attempts), Calls: Number(row.calls), Connected: Number(row.connected), "Talk time (seconds)": Number(row.talk_seconds), Enrolled: Number(row.enrolled), Collected: Number(row.revenue), "Follow-ups done": Number(row.followups_done), ...Object.fromEntries(statuses.map(status => [`Status: ${status}`, Number(row.statuses?.[status] ?? 0)])) }));
  return <>
    <PageHeader title="Employee performance">{!error && records.length > 0 && <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(records))}`} download={`employee-${view}-${range.fromStr}-${range.toStr}.csv`} className={btn("outline")}>Export CSV</a>}</PageHeader>
    <DateFilter label="Activity dates" allowAll={false} defaults={{ from: range.fromStr, to: range.toStr }} />
    <form key={`${view}:${one(sp.owner)}:${one(sp.source)}:${one(sp.stage)}:${showEmpty}`} className="mb-4 flex flex-wrap gap-2"><input type="hidden" name="from" value={range.fromStr} /><input type="hidden" name="to" value={range.toStr} />
      <Select name="view" aria-label="Report view" defaultValue={view} placeholder={null} options={[{ value: "summary", label: "One row per employee" }, { value: "day", label: "Daily breakdown" }, { value: "week", label: "Weekly breakdown" }, { value: "month", label: "Monthly breakdown" }]} className="!w-56" />
      <Select name="owner" aria-label="Employee" defaultValue={one(sp.owner) ?? ""} placeholder="All employees" options={lookups.users.map(user => ({ value: user.id, label: user.full_name }))} className="!w-48" />
      <Select name="source" aria-label="Source" defaultValue={one(sp.source) ?? ""} placeholder="All sources" options={lookups.sources.map(source => ({ value: source.id, label: source.name }))} className="!w-44" />
      <Select name="stage" aria-label="Status" defaultValue={one(sp.stage) ?? ""} placeholder="All statuses" options={lookups.stages.map(stage => ({ value: stage.id, label: stage.name }))} className="!w-44" />
      {!summary && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="empty" value="1" defaultChecked={showEmpty} />Show inactive periods</label>}
      <button className={btn("outline")}>Apply</button>
    </form>
    <p className="mb-3 text-xs text-muted">{summary ? `One row per employee. Totals cover ${range.fromStr} to ${range.toStr}. Status columns show the current status of leads allotted within that range.` : `Each row is one employee for one ${view === "day" ? "day" : view === "week" ? "week" : "month"}. ${showEmpty ? "Inactive periods are included." : "Periods with no activity are hidden."} Status columns describe that period’s allotted leads.`} Weeks start Monday. Dates use {env.timezone}.</p>
    {error ? <Card className="p-4 text-red-600">{error}</Card> : <Card><ReportTable columns={columns} rows={records} /></Card>}
  </>;
}
