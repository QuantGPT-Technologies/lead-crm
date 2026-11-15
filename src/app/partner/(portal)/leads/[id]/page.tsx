import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Handshake, MessageSquareText, User } from "lucide-react";
import { Badge, Card, Empty } from "@/components/ui";
import { getPartnerSession } from "@/lib/partner-auth";
import { partnerTimeline } from "@/lib/partner-data";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { RemarkForm } from "./remark-form";

type LeadRow = {
  id: string; lead_no: string; student_name: string; mobile: string; alt_mobile: string | null; email: string | null;
  city: string | null; state: string | null; product: string | null; created_at: string; next_followup_at: string | null;
  course: { name: string } | null; university: { name: string } | null; stage: { name: string; color: string } | null;
  sub_stage: { name: string } | null; owner: { full_name: string } | null;
};

export default async function PartnerLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { partner, admin } = await getPartnerSession();
  const { data } = await admin
    .from("leads")
    .select("id, lead_no, student_name, mobile, alt_mobile, email, city, state, product, created_at, next_followup_at, course:courses(name), university:universities(name), stage:stages(name, color), sub_stage:sub_stages(name), owner:profiles!leads_owner_id_fkey(full_name)")
    .eq("id", id)
    .eq("partner_id", partner.id)
    .maybeSingle();
  if (!data) notFound();
  const lead = data as unknown as LeadRow;
  const timeline = await partnerTimeline(admin, id, partner.id);

  const details: [string, string][] = [
    ["Mobile", lead.mobile],
    ["Alternate mobile", lead.alt_mobile ?? ""],
    ["Email", lead.email ?? ""],
    ["City", lead.city ?? ""],
    ["State", lead.state ?? ""],
    ["Course", lead.course?.name ?? lead.product ?? ""],
    ["University", lead.university?.name ?? ""],
    ["Counsellor", lead.owner?.full_name ?? "Not assigned yet"],
    ["Next follow-up", lead.next_followup_at ? fmtDateTime(lead.next_followup_at) : ""],
    ["Submitted on", fmtDate(lead.created_at)],
  ];

  return (
    <>
      <Link href="/partner" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-brand"><ArrowLeft size={14} /> My leads</Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Lead {lead.lead_no}</p>
          <h1 className="text-[28px] font-semibold leading-tight">{lead.student_name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lead.stage ? <Badge color={lead.stage.color}>{lead.stage.name}</Badge> : <Badge color="#64748b">New</Badge>}
          {lead.sub_stage && <Badge color="#64748b">{lead.sub_stage.name}</Badge>}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit p-4">
          <h2 className="mb-3 text-lg font-semibold">Details</h2>
          <dl className="space-y-2.5 text-sm">
            {details.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                <dt className="text-muted">{k}</dt>
                <dd className="break-words font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 text-lg font-semibold">Updates</h2>
          <p className="mb-4 text-sm text-muted">Updates from our team and your remarks appear here for both sides.</p>
          <RemarkForm leadId={lead.id} />
          {timeline.length === 0 ? <Empty>No updates yet.</Empty> : (
            <ol className="mt-5 space-y-0">
              {timeline.map((a) => {
                const mine = a.by === "you";
                const color = mine ? "#b45309" : a.type === "stage_change" ? "#7c3aed" : "#285b43";
                return (
                  <li key={a.id} className="relative flex gap-4 pb-5 last:pb-0">
                    <span className="absolute left-[15px] top-8 h-full w-px bg-line" aria-hidden />
                    <span className="z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
                      {mine ? <Handshake size={15} /> : a.type === "partner_remark" || a.type === "note" ? <MessageSquareText size={15} /> : <User size={15} />}
                    </span>
                    <div className="min-w-0 flex-1 border-t border-line pt-1.5">
                      <p className="font-semibold" style={{ color }}>{mine ? (a.type === "created" ? "You submitted this lead" : "You added a remark") : a.summary}</p>
                      {a.fields.length > 0 && (
                        <ul className="mt-1.5 space-y-1 text-sm">
                          {a.fields.map(([k, v]) => (
                            <li key={k} className="grid grid-cols-[minmax(100px,150px)_1fr] gap-2"><span className="font-semibold">• {k}</span><span className="break-words">{v}</span></li>
                          ))}
                        </ul>
                      )}
                      {a.text && <p className="mt-1.5 whitespace-pre-wrap rounded bg-soft p-2 text-sm">{a.text}</p>}
                      <p className="mt-1 text-xs text-muted">{fmtDateTime(a.created_at)}{!mine && a.author ? ` · ${a.author}` : ""}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
