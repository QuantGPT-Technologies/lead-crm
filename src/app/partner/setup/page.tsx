"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button, Field } from "@/components/ui";
import { finishPartnerSetup } from "./actions";

export default function PartnerSetupPage() {
  const [tokens, setTokens] = useState<{ access: string; refresh: string } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, start] = useTransition();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access = params.get("access_token"), refresh = params.get("refresh_token");
    window.history.replaceState(null, "", window.location.pathname);
    // Read the browser-only link fragment after hydration, then remove it from the address bar.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (access && refresh && ["recovery", "invite"].includes(params.get("type") || "")) setTokens({ access, refresh });
    else setError("This link is missing or expired. Use “Forgot password” on the partner sign-in page for a new one.");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-card p-8">
        <div className="flex items-center gap-3"><BrandLogo size={40} /><span className="font-bold">Partner portal</span></div>
        <h1 className="text-2xl font-bold">Verify your email and set a password</h1>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {success ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 font-semibold text-brand"><MailCheck size={18} /> Your email is verified and your password is saved.</p>
            <p className="text-sm text-muted">You can now sign in with your email and new password.</p>
            <Link href="/partner/login" className="font-semibold underline">Go to partner sign in</Link>
          </div>
        ) : tokens && (
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget), password = String(form.get("password"));
            if (password !== form.get("confirm")) return setError("The passwords do not match.");
            setError("");
            start(async () => {
              const result = await finishPartnerSetup(tokens.access, tokens.refresh, password);
              if (result.error) setError(result.error);
              else { setSuccess(true); setTokens(null); }
            });
          }}>
            <Field label="New password" required><input className="input" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
            <Field label="Confirm password" required><input className="input" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
            <p className="text-sm text-muted">Use at least 12 characters, including letters and numbers.</p>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Verify and save password"}</Button>
          </form>
        )}
      </div>
    </main>
  );
}
