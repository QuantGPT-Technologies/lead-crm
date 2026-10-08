import { getSession } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { NewLeadForm } from "./new-lead-form";

export default async function NewLeadPage() {
  const { profile } = await getSession();
  const lookups = await getLookups();
  return (
    <>
      <PageHeader title="Add New Lead" />
      <NewLeadForm lookups={lookups} isStaff={profile.role !== "agent"} selfId={profile.id} />
    </>
  );
}
