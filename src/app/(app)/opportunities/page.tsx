import { TableSort } from "@/components/table-sort";
import { tableSort } from "@/lib/view-filters";
import { DateFilter } from "@/components/date-filter";
import { filterDates, viewHref } from "@/lib/view-filters";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { Badge, Card, Empty, PageHeader, Pager, btn } from "@/components/ui";
import { fmtDate, fmtMoney, one, dateRange, type SearchParams } from "@/lib/utils";

const SIZE = 50;
const STATUS = ["open", "won", "lost"];
const COLOR: Record<string, string> = {
  open: "#285b43",
  won: "#16a34a",
  lost: "#dc2626",
};

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sort = tableSort(one(sp.sort), one(sp.dir), ["created_at", "amount", "probability", "expected_close", "title"], "created_at");
  const from = one(sp.from), to = one(sp.to);
  const reportDates = dateRange(from ?? "1970-01-01", to ?? "2999-12-31");
  const { supabase } = await getSession();
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const status = STATUS.includes(one(sp.status) ?? "") ? one(sp.status)! : "";

  let q = supabase
    .from("opportunities")
    .select(
      "id, title, amount, probability, expected_close, status, created_at, lead:leads(id, student_name), creator:profiles(full_name)",
      { count: "exact" },
    )
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false }).order("id", { ascending: sort.ascending })
    .range((page - 1) * SIZE, page * SIZE - 1);
  if (status) q = q.eq("status", status);
  q = filterDates(q, from, to, "created_at");
  const [{ data, count, error }, { data: totals }] = await Promise.all([
    q,
    supabase.rpc("crm_opportunity_totals", { p_from: reportDates.from.toISOString(), p_to: reportDates.to.toISOString() }),
  ]);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const total = (s: string) =>
    (
      (totals ?? []) as {
        status: string;
        deals: number;
        amount: number;
        weighted: number;
      }[]
    ).find((t) => t.status === s);

  return (
    <>
      <PageHeader title="Opportunity">
        {["", ...STATUS].map((s) => (
          <Link
            key={s}
            href={viewHref("/opportunities", { status: s, from, to, sort: sort.column, dir: sort.ascending ? "asc" : "desc" })}
            className={btn(s === status ? "primary" : "outline", "capitalize")}
          >
            {s || "All"}
          </Link>
        ))}
      </PageHeader>
      <DateFilter label="Created dates" />
      <TableSort defaultSort="created_at" options={[{ value: "created_at", label: "Created" }, { value: "amount", label: "Amount" }, { value: "probability", label: "Probability" }, { value: "expected_close", label: "Expected close" }, { value: "title", label: "Title" }]} />

      <div className="mb-3 grid gap-3 sm:grid-cols-4">
        {[
          [
            "Open pipeline",
            fmtMoney(total("open")?.amount),
            `${total("open")?.deals ?? 0} deal(s)`,
          ],
          [
            "Weighted forecast",
            fmtMoney(total("open")?.weighted),
            "amount × probability",
          ],
          [
            "Won",
            fmtMoney(total("won")?.amount),
            `${total("won")?.deals ?? 0} deal(s)`,
          ],
          [
            "Lost",
            fmtMoney(total("lost")?.amount),
            `${total("lost")?.deals ?? 0} deal(s)`,
          ],
        ].map(([label, value, hint]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-bold uppercase text-muted">{label}</p>
            <p className="text-2xl font-extrabold">{value}</p>
            <p className="text-xs text-muted">{hint}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>
              {[
                "Opportunity",
                "Lead",
                "Amount",
                "Probability",
                "Expected close",
                "Status",
                "Created by",
                "Created",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const lead = o.lead as {
                id: string;
                student_name: string;
              } | null;
              return (
                <tr key={o.id as string}>
                  <td className="font-semibold">{o.title as string}</td>
                  <td>
                    {lead && (
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-bold text-brand"
                      >
                        {lead.student_name}
                      </Link>
                    )}
                  </td>
                  <td>{fmtMoney(o.amount as number)}</td>
                  <td>{o.probability as number}%</td>
                  <td>{fmtDate(o.expected_close as string)}</td>
                  <td>
                    <Badge color={COLOR[o.status as string]}>
                      {o.status as string}
                    </Badge>
                  </td>
                  <td>
                    {(o.creator as { full_name: string } | null)?.full_name ??
                      ""}
                  </td>
                  <td>{fmtDate(o.created_at as string)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <Empty>
            No opportunities yet. Open a lead and use the target icon to add
            one; change its status there too.
          </Empty>
        )}
        <Pager
          page={page}
          size={SIZE}
          total={count ?? 0}
          params={{ status, from, to, sort: sort.column, dir: sort.ascending ? "asc" : "desc" }}
          path="/opportunities"
        />
      </Card>
    </>
  );
}
