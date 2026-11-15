"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Lock, Mail } from "lucide-react";
import { TAB_STORAGE } from "@/lib/tab-session-constants";
import { partnerPasswordHelp, partnerSignIn } from "./actions";

export function PartnerLoginFlow({ notice }: { notice?: string }) {
  const [error, setError] = useState(notice ?? "");
  const [info, setInfo] = useState("");
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(""); setInfo("");
    start(async () => {
      const res = await partnerSignIn(String(f.get("email") ?? ""), String(f.get("password") ?? ""));
      if (res.error) return setError(res.error);
      if (!res.tabKey) return setError("Could not start this tab's session. Please sign in again.");
      try { sessionStorage.setItem(TAB_STORAGE, res.tabKey); }
      catch {
        await fetch("/api/session/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: res.tabKey }) });
        return setError("Allow session storage in your browser to sign in.");
      }
      window.location.assign("/partner");
    });
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="text-[30px] font-semibold leading-tight">Partner sign in</h1>
      <p className="mt-2 text-muted">Use the email and password you set from your invitation.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <Input icon={Mail} label="Email" name="email" type="email" autoComplete="username" autoFocus placeholder="you@example.com" />
        <Input icon={Lock} label="Password" name="password" type="password" autoComplete="current-password" />
        {error && <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
        {info && <p role="status" className="text-sm text-muted">{info}</p>}
        <button type="submit" disabled={pending} className="ui-button h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-60 dark:text-bg">
          {pending ? "Please wait…" : "Sign in →"}
        </button>
        <button type="button" disabled={pending} className="text-sm font-semibold text-brand underline underline-offset-4" onClick={(event) => {
          const form = event.currentTarget.form;
          const email = form ? String(new FormData(form).get("email") ?? "") : "";
          setError(""); setInfo("");
          start(async () => {
            const r = await partnerPasswordHelp(email);
            if (r.error) setError(r.error); else setInfo(r.message ?? "");
          });
        }}>Forgot password or lost the invitation?</button>
      </form>
    </div>
  );
}

function Input({ icon: Icon, label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <span className="login-input flex h-12 items-center gap-3 rounded-xl border border-line bg-card px-4 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10">
        <Icon size={16} className="text-muted" />
        <input {...props} required className="h-full min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" />
      </span>
    </label>
  );
}
