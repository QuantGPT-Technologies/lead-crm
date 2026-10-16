"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Button, Field } from "@/components/ui";
import { finishPasswordSetup } from "./actions";

export default function PasswordSetupPage() {
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
    // Synchronize the browser-only recovery fragment after hydration, then discard it from the URL.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (access && refresh && ["recovery", "invite"].includes(params.get("type") || "")) setTokens({ access, refresh });
    else setError("This setup link is missing or expired. Ask for a new password-setup email.");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  return <main className="flex min-h-screen items-center justify-center p-6">
    <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-white p-8">
      <div className="flex items-center gap-3"><BrandLogo size={40} /><span className="font-bold">SUCCESS MENTORIX</span></div>
      <h1 className="text-2xl font-bold">Set your password</h1>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {success ? <><p>Your password is saved. Sign in with your email and new password.</p><Link href="/login" className="font-semibold underline">Go to sign in</Link></> : tokens && <form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        const form = new FormData(e.currentTarget), password = String(form.get("password"));
        if (password !== form.get("confirm")) return setError("The passwords do not match.");
        setError("");
        start(async () => {
          const result = await finishPasswordSetup(tokens.access, tokens.refresh, password);
          if (result.error) setError(result.error);
          else { setSuccess(true); setTokens(null); }
        });
      }}>
        <Field label="New password" required><input className="input" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
        <Field label="Confirm password" required><input className="input" name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
        <p className="text-sm text-muted">Use at least 12 characters, including letters and numbers.</p>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"}</Button>
      </form>}
    </div>
  </main>;
}
