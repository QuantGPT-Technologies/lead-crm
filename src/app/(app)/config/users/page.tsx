import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { UsersTable } from "./users-table";
import { agentFirebaseRequired } from "@/lib/agent-auth";

export default async function UsersPage() {
  const { profile } = await requireRole("admin");
  // emails and phones are not readable through the signed-in client; the admin check above allows the service role here
  const { data } = await createAdminClient().from("profiles").select("*").order("created_at");
  return (
    <>
      <PageHeader title="Users" />
      <UsersTable users={(data ?? []) as Profile[]} selfId={profile.id} agentOtp={await agentFirebaseRequired()} />
    </>
  );
}
