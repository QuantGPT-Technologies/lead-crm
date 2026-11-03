import { TableSort } from "@/components/table-sort";
import { tableSort } from "@/lib/view-filters";
import { DateFilter } from "@/components/date-filter";
import { filterDates } from "@/lib/view-filters";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Badge, Card, Empty, PageHeader, Pager, Select, btn } from "@/components/ui";
import { fmtDateTime, one, type SearchParams } from "@/lib/utils";

const SIZE = 50;
const TYPES = ["created", "updated", "stage_change", "assigned", "note", "call", "email", "sms", "whatsapp", "task", "rechurn", "enrolled", "opportunity", "post"];

export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const sort = tableSort(one(sp.sort), one(sp.dir), ["created_at", "type", "summary"], "created_at");
  const from = one(sp.from), to = one(sp.to);
  const { supabase } = await getSession();
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const type = TYPES.includes(one(sp.type) ?? "") ? one(sp.type)! : "";

  let q = supabase
    .from("lead_activities")
    .select("id, lead_id, type, summary, created_at, lead:leads(student_name), actor:profiles(full_name)", { count: "exact" })
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false }).order("id", { ascending: sort.ascending })
    .range((page - 1) * SIZE, page * SIZE - 1);
  if (type) q = q.eq("type", type);
  q = filterDates(q, from, to, "created_at");
  const { data, count, error } = await q;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return (
    <>
      <PageHeader title="Activity Log">
        <form className="flex gap-2"><input type="hidden" name="from" value={from ?? ""} /><input type="hidden" name="to" value={to ?? ""} />
          <Select name="type" defaultValue={type} aria-label="Activity type" options={TYPES.map((t) => ({ value: t, label: t.replace("_", " ") }))} placeholder="All activity" className="!h-9 !w-44 capitalize" />
          <button type="submit" className={btn("outline")}>
            Filter
          </button>
        </form>
      </PageHeader>
      <DateFilter label="Activity dates" />
      <TableSort defaultSort="created_at" options={[{ value: "created_at", label: "When" }, { value: "type", label: "Activity type" }, { value: "summary", label: "Summary" }]} />
      <Card className="overflow-x-auto">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["When", "User", "Type", "Lead", "What happened"].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id as string}>
                <td>{fmtDateTime(a.created_at as string)}</td>
                <td>{(a.actor as { full_name: string } | null)?.full_name ?? "System"}</td>
                <td>
                  <Badge>{String(a.type).replace("_", " ")}</Badge>
                </td>
                <td>
                  <Link href={`/leads/${a.lead_id}`} className="font-bold text-brand">
                    {(a.lead as { student_name: string } | null)?.student_name ?? "Lead"}
                  </Link>
                </td>
                <td className="max-w-xl truncate" title={a.summary as string}>
                  {a.summary as string}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No activity yet.</Empty>}
        <Pager page={page} size={SIZE} total={count ?? 0} params={{ type, from, to, sort: sort.column, dir: sort.ascending ? "asc" : "desc" }} path="/activity" />
      </Card>
    </>
  );
}
