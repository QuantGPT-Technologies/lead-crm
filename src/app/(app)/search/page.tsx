import Link from "next/link";
import { getSession } from "@/lib/auth";
import { applyLeadFilters } from "@/lib/data";
import { Badge, Card, Empty, PageHeader, btn } from "@/components/ui";
import { cleanSearch, fmtDate, one, type SearchParams } from "@/lib/utils";

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = cleanSearch(one((await searchParams).q) ?? "");
  const { supabase } = await getSession();

  const { data, error } =
    q.length >= 3
      ? await applyLeadFilters(
          supabase.from("leads").select("id, lead_no, student_name, mobile, email, created_at, stage:stages(name, color), owner:profiles!leads_owner_id_fkey(full_name)"),
          { q },
        )
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: null, error: null };
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return (
    <>
      <PageHeader title="Search Lead" />
      <Card className="p-4">
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={q} autoFocus required minLength={3} placeholder="Name, mobile, email or lead number (min 3 characters)" aria-label="Search leads" className="input max-w-xl flex-1" />
          <button type="submit" className={btn()}>
            Search
          </button>
        </form>
      </Card>

      <Card className="mt-3 overflow-x-auto">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        {q.length < 3 ? (
          <Empty>Type at least 3 characters to search the leads you have access to.</Empty>
        ) : rows.length === 0 ? (
          <Empty>No lead matches “{q}”.</Empty>
        ) : (
          <table className="table-grid w-full border-collapse">
            <thead>
              <tr>{["Lead No", "Student Name", "Mobile", "Email", "Stage", "Lead Owner", "Created"].map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const stage = l.stage as { name: string; color: string } | null;
                return (
                  <tr key={l.id as string}>
                    <td>{l.lead_no as string}</td>
                    <td>
                      <Link href={`/leads/${l.id}`} className="font-bold text-brand">
                        {l.student_name as string}
                      </Link>
                    </td>
                    <td>{l.mobile as string}</td>
                    <td>{(l.email as string) ?? ""}</td>
                    <td>{stage && <Badge color={stage.color}>{stage.name}</Badge>}</td>
                    <td>{(l.owner as { full_name: string } | null)?.full_name ?? "Unassigned"}</td>
                    <td>{fmtDate(l.created_at as string)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {rows.length === 50 && <p className="p-3 text-center text-xs text-muted">Showing the first 50 matches. Refine the search to narrow it down.</p>}
      </Card>
    </>
  );
}
