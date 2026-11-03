import { DateFilter } from "@/components/date-filter";
import { filterDates } from "@/lib/view-filters";
import { one, type SearchParams } from "@/lib/utils";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { UsersTable } from "./users-table";

export default async function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { profile } = await requireRole("admin");
  // emails and phones are not readable through the signed-in client; the admin check above allows the service role here
  const { data } = await filterDates(createAdminClient().from("profiles").select("*").order("created_at"), one(sp.from), one(sp.to));
  const { data: directory } = await createAdminClient().from("profiles").select("*");
  return (
    <>
      <PageHeader title="Team members" /><DateFilter label="Account creation dates" />
      <UsersTable users={(data ?? []) as Profile[]} selfId={profile.id} directory={(directory ?? []) as Profile[]} />
    </>
  );
}
