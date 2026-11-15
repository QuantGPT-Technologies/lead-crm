import "server-only";
import { createStatelessClient } from "@/lib/supabase/server";

const appOrigin = () => (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://lead-crm-orpin-ten.vercel.app").replace(/\/$/, "");

/**
 * Emails the partner a one-time link to /partner/setup. Opening it proves the mailbox
 * (email verification) and lets the partner choose a password. Returns an error text or null.
 */
export async function sendPartnerSetupEmail(email: string): Promise<string | null> {
  try {
    const { error } = await createStatelessClient().auth.resetPasswordForEmail(email, { redirectTo: `${appOrigin()}/partner/setup` });
    if (error) return error.status === 429
      ? "the email limit was reached. Wait a minute before trying again."
      : "the verification email could not be sent. Check Supabase email settings.";
    return null;
  } catch {
    return "the email service could not be reached.";
  }
}
