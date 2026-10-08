import Link from "next/link";
import { getSession } from "@/lib/auth";
import { emailProviderConfigured } from "@/lib/messaging";
import { Badge, Card, Empty, PageHeader, Pager, btn } from "@/components/ui";
import { fmtDateTime, one, type SearchParams } from "@/lib/utils";

const SIZE = 50;
const CHANNELS = ["email", "sms", "whatsapp"];
const STATUS_COLOR: Record<string, string> = { sent: "#16a34a", failed: "#dc2626", logged: "#64748b" };

export default async function CommunicationPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase } = await getSession();
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const channel = CHANNELS.includes(one(sp.channel) ?? "") ? one(sp.channel)! : "";

  let q = supabase
    .from("messages")
    .select("id, channel, recipient, subject, body, status, error, created_at, lead:leads(id, student_name), sender:profiles(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * SIZE, page * SIZE - 1);
  if (channel) q = q.eq("channel", channel);
  const { data, count, error } = await q;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return (
    <>
      <PageHeader title="Message Log">
        {["", ...CHANNELS].map((c) => (
          <Link key={c} href={`/communication${c ? `?channel=${c}` : ""}`} className={btn(c === channel ? "primary" : "outline", "capitalize")}>
            {c || "All"}
          </Link>
        ))}
      </PageHeader>

      {!emailProviderConfigured() && (
        <Card className="mb-3 p-3 text-sm text-muted">
          No email provider is connected, so messages are saved here and sent from each user&apos;s own mail, SMS or WhatsApp app. Add <b>RESEND_API_KEY</b> to send email directly from the CRM.
        </Card>
      )}

      <Card className="overflow-x-auto">
        {error && <p className="p-4 text-red-600">{error.message}</p>}
        <table className="table-grid w-full border-collapse">
          <thead>
            <tr>{["When", "Channel", "Lead", "To", "Message", "Status", "By"].map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const lead = m.lead as { id: string; student_name: string } | null;
              const text = `${m.subject ? `${m.subject} - ` : ""}${m.body}`;
              return (
                <tr key={m.id as string}>
                  <td>{fmtDateTime(m.created_at as string)}</td>
                  <td className="capitalize">{m.channel as string}</td>
                  <td>
                    {lead && (
                      <Link href={`/leads/${lead.id}`} className="font-bold text-brand">
                        {lead.student_name}
                      </Link>
                    )}
                  </td>
                  <td>{m.recipient as string}</td>
                  <td className="max-w-md truncate" title={text}>
                    {text}
                  </td>
                  <td title={(m.error as string) ?? undefined}>
                    <Badge color={STATUS_COLOR[m.status as string]}>{m.status as string}</Badge>
                  </td>
                  <td>{(m.sender as { full_name: string } | null)?.full_name ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No messages yet. Compose one from a lead&apos;s page.</Empty>}
        <Pager page={page} size={SIZE} total={count ?? 0} params={{ channel }} path="/communication" />
      </Card>
    </>
  );
}
