import { requireRole } from "@/lib/auth";
import { loadMaster } from "@/lib/master-data";
import { MasterCrud } from "@/components/master-crud";
import { PageHeader } from "@/components/ui";

export default async function TemplatesPage() {
  const { supabase } = await requireRole("admin");
  const { rows, refs } = await loadMaster(supabase, "message_templates");
  return (
    <>
      <PageHeader title="Templates" />
      <MasterCrud table="message_templates" rows={rows} refs={refs} />
    </>
  );
}
