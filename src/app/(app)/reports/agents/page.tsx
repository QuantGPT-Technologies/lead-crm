import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Card, Empty, PageHeader, btn } from "@/components/ui";
import { dateRange, fmtMoney, one, toCsv, type SearchParams } from "@/lib/utils";

interface AgentRow {
  agent_id: string; agent: string; emp_code: string; leads: number; calls: number; connected: number; talk_seconds: number;
  followups_done: number; enrolled: number; revenue: number;
}

export default async function AgentReportPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin", "manager");
  const range = dateRange(one(sp.from), one(sp.to), 30);
  const { data, error } = await supabase.rpc("report_agent_performance", { p_from: range.from.toISOString(), p_to: range.to.toISOString() });
  const rows = (data ?? []) as AgentRow[];
  const talk = (s: number) => `${Math.floor(Number(s) / 3600)}h ${Math.floor((Number(s) % 3600) / 60)}m`;
  const pct = (a: number, b: number) => (Number(b) ? `${((Number(a) / Number(b)) * 100).toFixed(1)}%` : "0%");
  const csv = toCsv(
    rows.map((r) => ({ User: r.agent, "User ID": r.emp_code, "Leads allotted": r.leads, Calls: r.calls, Connected: r.connected, "Talk time (sec)": r.talk_seconds, "Follow-ups done": r.followups_done, Enrolled: r.enrolled, Collected: r.revenue })),
  );

  return (
    <>
      <PageHeader title="Agent Performance">
        <form className="flex flex-wrap items-center gap-2">
          <input type="date" name="from" defaultValue={range.fromStr} aria-label="From date" className="input !h-9 !w-40" />
          <input type="date" name="to" defaultValue={range.toStr} aria-label="To date" className="input !h-9 !w-40" />
          <button type="submit" className={btn("outline")}>
            Apply
          </button>
        </form>
        {rows.length > 0 && (
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download={`agent-performance-${range.fromStr}-to-${range.toStr}.csv`} className={btn("success")}>
            <Download size={15} /> CSV
          </a>
        )}
      </PageHeader>

      <Card className="overflow-x-auto">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["User", "User ID", "Leads allotted", "Calls", "Connected", "Connect rate", "Talk time", "Follow-ups done", "Enrolled", "Collected"].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agent_id}>
                <td className="font-semibold">{r.agent}</td>
                <td>{r.emp_code}</td>
                <td>{r.leads}</td>
                <td>{r.calls}</td>
                <td>{r.connected}</td>
                <td>{pct(r.connected, r.calls)}</td>
                <td>{talk(r.talk_seconds)}</td>
                <td>{r.followups_done}</td>
                <td className="font-bold text-emerald-600">{r.enrolled}</td>
                <td>{fmtMoney(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No active users.</Empty>}
      </Card>
      <p className="mt-2 text-xs text-muted">Activity inside the selected period: leads allotted, calls logged, follow-ups completed and enrolments recorded by each user.</p>
    </>
  );
}
