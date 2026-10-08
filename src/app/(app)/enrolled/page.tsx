import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Card, Empty, PageHeader, Pager, btn } from "@/components/ui";
import { dateRange, fmtDate, fmtMoney, one, type SearchParams } from "@/lib/utils";
import { PaymentCell } from "./payment-cell";

const SIZE = 50;

export default async function EnrolledPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await getSession();
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const range = dateRange(one(sp.from), one(sp.to), 365);

  const [{ data, count, error }, { data: sums }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, enrollment_no, fee_amount, paid_amount, enrolled_on, lead:leads(id, student_name, mobile), university:universities(name), course:courses(name), creator:profiles(full_name)", { count: "exact" })
      .gte("enrolled_on", range.fromStr)
      .lte("enrolled_on", range.toStr)
      .order("enrolled_on", { ascending: false })
      .range((page - 1) * SIZE, page * SIZE - 1),
    supabase.rpc("enrollment_totals", { p_from: range.fromStr, p_to: range.toStr }),
  ]);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const totals = ((sums ?? []) as { fee: number; paid: number }[])[0];
  const fee = Number(totals?.fee ?? 0);
  const paid = Number(totals?.paid ?? 0);

  return (
    <>
      <PageHeader title="Enrolled">
        <form className="flex flex-wrap items-center gap-2">
          <input type="date" name="from" defaultValue={range.fromStr} aria-label="From date" className="input !h-9 !w-40" />
          <input type="date" name="to" defaultValue={range.toStr} aria-label="To date" className="input !h-9 !w-40" />
          <button type="submit" className={btn("outline")}>
            Apply
          </button>
        </form>
      </PageHeader>

      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        {[["Enrolments", String(count ?? 0)], ["Total fee", fmtMoney(fee)], ["Collected", fmtMoney(paid)], ["Outstanding", fmtMoney(fee - paid)]].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-bold uppercase text-muted">{label}</p>
            <p className="text-2xl font-extrabold">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["Enrolled on", "Student", "Mobile", "University", "Course", "Enrolment no.", "Fee", "Paid", "Balance", "Enrolled by"].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const lead = e.lead as { id: string; student_name: string; mobile: string } | null;
              const rel = (k: string) => (e[k] as { name?: string; full_name?: string } | null);
              return (
                <tr key={e.id as string}>
                  <td>{fmtDate(e.enrolled_on as string)}</td>
                  <td>
                    {lead && (
                      <Link href={`/leads/${lead.id}`} className="font-bold text-brand">
                        {lead.student_name}
                      </Link>
                    )}
                  </td>
                  <td>{lead?.mobile}</td>
                  <td>{rel("university")?.name ?? ""}</td>
                  <td>{rel("course")?.name ?? ""}</td>
                  <td>{(e.enrollment_no as string) ?? ""}</td>
                  <td>{fmtMoney(e.fee_amount as number)}</td>
                  <td>
                    <PaymentCell id={e.id as string} paid={Number(e.paid_amount)} fee={Number(e.fee_amount)} />
                  </td>
                  <td className={Number(e.fee_amount) > Number(e.paid_amount) ? "font-bold text-red-600" : "text-emerald-600"}>
                    {fmtMoney(Number(e.fee_amount) - Number(e.paid_amount))}
                  </td>
                  <td>{rel("creator")?.full_name ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No enrolments in this period. Mark a lead as enrolled from its page (graduation-cap icon).</Empty>}
        <Pager page={page} size={SIZE} total={count ?? 0} params={{ from: range.fromStr, to: range.toStr }} path="/enrolled" />
      </Card>
    </>
  );
}
