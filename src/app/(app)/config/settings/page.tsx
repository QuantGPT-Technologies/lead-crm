import { requireRole } from "@/lib/auth";
import { getSetting } from "@/lib/data";
import { requireGlobalLogin, requireOtp } from "@/lib/env";
import { emailProviderConfigured } from "@/lib/messaging";
import { createAdminClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { SettingsForms } from "./settings-forms";

export default async function SettingsPage() {
  const { supabase } = await requireRole("admin");
  const [webhook, mask, { data: global }] = await Promise.all([
    getSetting<string>(supabase, "lead_post_webhook", ""),
    getSetting<boolean>(supabase, "mask_contacts_in_list", true),
    createAdminClient().from("global_login").select("email").maybeSingle(),
  ]);

  const status: [string, boolean, string][] = [
    ["Global sign-in step", requireGlobalLogin(), "AUTH_REQUIRE_GLOBAL_LOGIN"],
    ["Email OTP step", requireOtp(), "AUTH_REQUIRE_OTP"],
    ["Email sending (Resend)", emailProviderConfigured(), "RESEND_API_KEY"],
    ["Push reminders (Firebase)", !!process.env.FIREBASE_CLIENT_EMAIL && !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "FIREBASE_* keys"],
  ];

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsForms webhook={webhook} mask={mask} globalEmail={global?.email ?? ""} />
        <Card className="self-start p-4">
          <h2 className="mb-1 text-base font-extrabold">Environment</h2>
          <p className="mb-3 text-xs text-muted">These are switched on or off in the server&apos;s .env.local file, not here.</p>
          <ul className="space-y-2">
            {status.map(([label, on, key]) => (
              <li key={label} className="flex items-center justify-between gap-2">
                <span>
                  {label} <span className="font-mono text-xs text-muted">({key})</span>
                </span>
                <Badge color={on ? "#16a34a" : "#64748b"}>{on ? "On" : "Off"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
