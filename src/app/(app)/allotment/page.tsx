import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { Card, Empty, PageHeader } from "@/components/ui";
import { TransferForm } from "./transfer-form";

interface Summary {
  agent_id: string; agent: string; emp_code: string; role: string; total: number; untouched: number; due_followups: number; enrolled: number;
}

export default async function AllotmentPage() {
  const { supabase } = await requireRole("admin", "manager");
  const [{ data }, { count: unassigned }] = await Promise.all([
    supabase.rpc("allotment_summary"),
    supabase.from("leads").select("id", { count: "exact", head: true }).is("owner_id", null),
  ]);
  const rows = (data ?? []) as Summary[];

  return (
    <>
      <PageHeader title="Data Allotment">
        <Link href="/leads?owner=none" className="font-bold text-brand">
          {unassigned ?? 0} unassigned lead(s)
        </Link>
      </PageHeader>

      <TransferForm users={rows.map((r) => ({ id: r.agent_id, name: `${r.agent} (${r.total})` }))} />

      <Card className="mt-4 overflow-x-auto">
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["User", "User ID", "Role", "Leads held", "Not yet attempted", "Overdue follow-ups", "Enrolled", ""].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.agent_id}>
                <td className="font-semibold">{r.agent}</td>
                <td>{r.emp_code}</td>
                <td className="capitalize">{r.role}</td>
                <td>{r.total}</td>
                <td>{r.untouched}</td>
                <td className={Number(r.due_followups) > 0 ? "font-bold text-red-600" : ""}>{r.due_followups}</td>
                <td>{r.enrolled}</td>
                <td>
                  <Link href={`/leads?owner=${r.agent_id}`} className="font-bold text-brand">
                    View leads
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No active users.</Empty>}
      </Card>
    </>
  );
}
