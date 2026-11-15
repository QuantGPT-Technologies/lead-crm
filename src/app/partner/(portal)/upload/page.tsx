import { getPartnerSession } from "@/lib/partner-auth";
import { partnerCourses } from "@/lib/partner-data";
import { PasteUploader } from "./paste-uploader";

export default async function PartnerUploadPage() {
  const { admin } = await getPartnerSession();
  const courses = await partnerCourses(admin);
  return (
    <>
      <div className="mb-6">
        <p className="eyebrow mb-2">Partner portal</p>
        <h1 className="text-[28px] font-semibold leading-tight">Add leads</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Copy rows from Excel or Google Sheets and paste them below, with or without the header row. We read the columns
          automatically. Check the preview, then add every lead in one go.
        </p>
      </div>
      <PasteUploader courseNames={[...new Set(courses.map((c) => c.name))]} />
    </>
  );
}
