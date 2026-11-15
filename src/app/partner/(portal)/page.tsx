import Link from "next/link";
import { ClipboardPaste, Search } from "lucide-react";
import { Badge, btn, Card, Empty, Pager } from "@/components/ui";
import { getPartnerSession } from "@/lib/partner-auth";
import { cleanSearch, fmtDate, fmtDateTime, one, type SearchParams } from "@/lib/utils";

const SIZE = 50;

type Row = {
  id: string; lead_no: string; student_name: string; city: string | null; state: string | null; product: string | null;
  created_at: string; last_activity_at: string | null;
  course: { name: string } | null; stage: { name: string; color: string } | null;
};

export default async function PartnerLeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { partner, admin } = await getPartnerSession();
  const q = cleanSearch(one(sp.q) ?? "");
  const page = Math.max(1, Number(one(sp.page)) || 1);

  // The list shows summary columns only; contact details and updates open with the lead.
  let query = admin
    .from("leads")
    .select("id, lead_no, student_name, city, state, product, created_at, last_activity_at, course:courses(name), stage:stages(name, color)", { count: "exact" })
    .eq("partner_id", partner.id);
  if (q) query = query.or(`student_name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%,lead_no.ilike.%${q}%`);
  const { data, count } = await query.order("created_at", { ascending: false }).order("id").range((page - 1) * SIZE, page * SIZE - 1);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Partner portal</p>
          <h1 className="text-[28px] font-semibold leading-tight">My leads</h1>
          <p className="mt-2 text-sm text-muted">Every lead you have submitted. Open a lead to see its details and the latest updates from our team.</p>
        </div>
        <Link href="/partner/upload" className={btn("primary")}><ClipboardPaste size={15} /> Add leads</Link>
      </div>
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-line p-3" role="search">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-line px-3">
            <Search size={14} className="text-muted" />
            <input name="q" defaultValue={q} placeholder="Search by name, city, state or lead number" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Search leads" />
          </label>
          <button type="submit" className={btn("outline")}>Search</button>
          {q && <Link href="/partner" className={btn("ghost")}>Clear</Link>}
        </form>
        {rows.length === 0 ? (
          <Empty>{q ? "No leads match your search." : <>You have not submitted any leads yet. <Link href="/partner/upload" className="font-semibold text-brand underline">Add your first leads</Link>.</>}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-grid w-full border-collapse">
              <thead>
                <tr>{["Lead no.", "Contact name", "City", "State", "Course", "Status", "Submitted", "Last update"].map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const href = `/partner/leads/${l.id}`;
                  return (
                    <tr key={l.id} className="hover:bg-soft">
                      <td className="font-mono text-xs"><Link href={href}>{l.lead_no}</Link></td>
                      <td className="font-semibold"><Link href={href} className="text-brand hover:underline">{l.student_name}</Link></td>
                      <td>{l.city ?? ""}</td>
                      <td>{l.state ?? ""}</td>
                      <td>{l.course?.name ?? l.product ?? ""}</td>
                      <td>{l.stage ? <Badge color={l.stage.color}>{l.stage.name}</Badge> : <span className="text-muted">New</span>}</td>
                      <td className="whitespace-nowrap">{fmtDate(l.created_at)}</td>
                      <td className="whitespace-nowrap text-muted">{l.last_activity_at ? fmtDateTime(l.last_activity_at) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} size={SIZE} total={count ?? 0} params={{ q: q || undefined }} path="/partner" />
      </Card>
    </>
  );
}
