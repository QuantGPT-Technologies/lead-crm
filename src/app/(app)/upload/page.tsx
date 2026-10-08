import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getLookups } from "@/lib/data";
import { Card, Empty, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";
import { Uploader } from "./uploader";

export default async function UploadPage() {
  const { supabase } = await requireRole("admin", "manager");
  const lookups = await getLookups();
  const { data: batches } = await supabase
    .from("upload_batches")
    .select("id, file_name, total_rows, inserted_rows, duplicate_rows, invalid_rows, created_at, uploader:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <>
      <PageHeader title="Upload Leads" />
      <Uploader sources={lookups.sources} />

      <h2 className="mb-2 mt-6 text-base font-extrabold">Recent uploads</h2>
      <Card className="overflow-x-auto">
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["File", "Uploaded by", "When", "Rows", "Added", "Duplicates", "Invalid", ""].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {(batches ?? []).map((b) => (
              <tr key={b.id}>
                <td>{b.file_name}</td>
                <td>{(b.uploader as unknown as { full_name: string } | null)?.full_name ?? ""}</td>
                <td>{fmtDateTime(b.created_at)}</td>
                <td>{b.total_rows}</td>
                <td className="font-bold text-emerald-600">{b.inserted_rows}</td>
                <td>{b.duplicate_rows}</td>
                <td>{b.invalid_rows}</td>
                <td>
                  <Link href={`/leads?batch=${b.id}`} className="mr-3 font-bold text-brand">
                    View leads
                  </Link>
                  <Link href={`/distribute?batch=${b.id}`} className="font-bold text-brand">
                    Distribute
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!batches?.length && <Empty>No files uploaded yet.</Empty>}
      </Card>
    </>
  );
}
