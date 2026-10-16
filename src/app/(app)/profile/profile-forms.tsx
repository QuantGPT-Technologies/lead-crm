"use client";

import { useTransition } from "react";
import { Button, Card, Field } from "@/components/ui";
import { notify, toast } from "@/components/toast";
import type { Profile } from "@/lib/types";
import { changePassword, updateProfile } from "../ops-actions";

export function ProfileForms({ profile }: { profile: Profile }) {
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <h2 className="mb-3 text-base font-extrabold">Details</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => void notify(await updateProfile({ full_name: String(f.get("full_name")), phone: String(f.get("phone")) })));
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="User ID">
              <input value={profile.emp_code} disabled className="input" />
            </Field>
            <Field label="Role">
              <input value={profile.role} disabled className="input capitalize" />
            </Field>
          </div>
          <Field label="Email">
            <input value={profile.email} disabled className="input" />
          </Field>
          <Field label="Full name" required>
            <input name="full_name" required defaultValue={profile.full_name} className="input" />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" defaultValue={profile.phone ?? ""} className="input" />
          </Field>
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </Card>

      <Card className="self-start p-4">
        <h2 className="mb-3 text-base font-extrabold">Change password</h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const next = String(f.get("next"));
            if (next !== String(f.get("confirm"))) return toast("The two new passwords do not match", "error");
            start(async () => {
              if (notify(await changePassword(String(f.get("current")), next))) form.reset();
            });
          }}
        >
          <Field label="Current password" required>
            <input name="current" type="password" required autoComplete="current-password" className="input" />
          </Field>
          <Field label="New password" required>
            <input name="next" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </Field>
          <Field label="Confirm new password" required>
            <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </Field>
          <Button type="submit" disabled={pending}>
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
