"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field } from "@/components/ui";
import { notify } from "@/components/toast";
import { saveSettings, setGlobalLogin } from "../../ops-actions";

export function SettingsForms({ webhook, mask, globalEmail }: { webhook: string; mask: boolean; globalEmail: string }) {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState(webhook);
  const [masked, setMasked] = useState(mask);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-3 text-base font-extrabold">Lead settings</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => void notify(await saveSettings({ lead_post_webhook: url, mask_contacts_in_list: masked })));
          }}
        >
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={masked} onChange={(e) => setMasked(e.target.checked)} />
            Mask mobile and email in the lead list for managers and agents
          </label>
          <Field label="Lead Post URL (optional)">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://partner.example.com/api/leads" className="input" />
          </Field>
          <p className="text-xs text-muted">When set, the “Lead Post” tab on a lead sends that lead as JSON (HTTP POST) to this address and records the response.</p>
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="mb-1 text-base font-extrabold">Global login</h2>
        <p className="mb-3 text-xs text-muted">The shared company email and password asked for on the first sign-in screen. Changing it affects everyone.</p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            start(async () => {
              if (notify(await setGlobalLogin(String(f.get("email")), String(f.get("password"))))) form.reset();
            });
          }}
        >
          <Field label="Global email" required>
            <input name="email" type="email" required defaultValue={globalEmail} className="input" />
          </Field>
          <Field label="New global password" required>
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </Field>
          <Button type="submit" disabled={pending}>
            Update global login
          </Button>
        </form>
      </Card>
    </div>
  );
}
