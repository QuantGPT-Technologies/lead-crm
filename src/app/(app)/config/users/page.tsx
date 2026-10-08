import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import type { Profile } from "@/lib/types";
import { UsersTable } from "./users-table";

export default async function UsersPage() {
  const { supabase, profile } = await requireRole("admin");
  const { data } = await supabase.from("profiles").select("*").order("created_at");
  return (
    <>
      <PageHeader title="Users" />
      <UsersTable users={(data ?? []) as Profile[]} selfId={profile.id} />
    </>
  );
}
