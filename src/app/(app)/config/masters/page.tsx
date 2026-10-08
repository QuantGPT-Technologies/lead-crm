import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { loadMaster } from "@/lib/master-data";
import { MASTERS, type MasterTable } from "@/lib/masters";
import { MasterCrud } from "@/components/master-crud";
import { PageHeader, btn } from "@/components/ui";
import { one, type SearchParams } from "@/lib/utils";

const TABLES: MasterTable[] = ["lead_sources", "universities", "courses", "stage_funnels", "stages", "sub_stages"];

export default async function MastersPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await requireRole("admin");
  const requested = one((await searchParams).table) as MasterTable | undefined;
  const table = requested && TABLES.includes(requested) ? requested : TABLES[0];
  const { rows, refs } = await loadMaster(supabase, table);

  return (
    <>
      <PageHeader title="Masters" />
      <div className="mb-3 flex flex-wrap gap-2">
        {TABLES.map((t) => (
          <Link key={t} href={`/config/masters?table=${t}`} className={btn(t === table ? "primary" : "outline")}>
            {MASTERS[t].label}
          </Link>
        ))}
      </div>
      {/* keyed so an open dialog never carries over to another table */}
      <MasterCrud key={table} table={table} rows={rows} refs={refs} />
    </>
  );
}
