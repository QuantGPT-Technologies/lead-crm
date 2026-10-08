import "server-only";

export interface SendResult {
  status: "sent" | "failed" | "logged";
  provider_ref?: string;
  error?: string;
}

/**
 * Delivers a message through a provider when one is configured.
 * - email: Resend (set RESEND_API_KEY + EMAIL_FROM). Without a key the message is only logged.
 * - sms / whatsapp: logged only; the UI opens the device's SMS app / WhatsApp chat.
 *   To send from the server, add your provider call (MSG91, Twilio, WhatsApp Cloud API...) here.
 */
export async function deliver(channel: "email" | "sms" | "whatsapp", to: string, subject: string | null, body: string): Promise<SendResult> {
  if (channel !== "email" || !process.env.RESEND_API_KEY) return { status: "logged" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: subject || "(no subject)", text: body }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", error: json.message || `Resend returned ${res.status}` };
    return { status: "sent", provider_ref: json.id };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "Network error" };
  }
}

export const emailProviderConfigured = () => !!process.env.RESEND_API_KEY;
