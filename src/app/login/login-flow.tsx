"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Check, Eye, EyeOff, Globe, KeyRound, Lock, Mail, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { globalLogin, resetLogin, userLogin, verifyOtp } from "./actions";

type Step = "global" | "user" | "otp";

const TITLES: Record<Step, [string, string]> = {
  global: ["GLOBAL SIGN IN", "Enter your email and password to login"],
  user: ["USER SIGN IN", "Enter your user id and password"],
  otp: ["OTP VALIDATION", "Enter the code sent to your registered email"],
};

export function LoginFlow({
  useGlobal,
  useOtp,
  initialStep,
  next,
  notice,
}: {
  useGlobal: boolean;
  useOtp: boolean;
  initialStep: Step;
  next: string;
  notice?: string;
}) {
  const [step, setStep] = useState<Step>(initialStep);
  const [error, setError] = useState(notice ?? "");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [pending, start] = useTransition();

  const steps = [
    ...(useGlobal ? [{ key: "global" as Step, label: "Global Login", icon: Globe }] : []),
    { key: "user" as Step, label: "User Login", icon: User },
    ...(useOtp ? [{ key: "otp" as Step, label: "OTP Validation", icon: KeyRound }] : []),
  ];
  const current = steps.findIndex((s) => s.key === step);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const get = (k: string) => String(f.get(k) ?? "");
    setError("");
    start(async () => {
      const res =
        step === "global"
          ? await globalLogin(get("email"), get("password"))
          : step === "user"
            ? await userLogin(get("userId"), get("password"))
            : await verifyOtp(get("otp"));
      if (res.error) return setError(res.error);
      if (res.step === "done") return window.location.assign(next);
      if (res.name) setName(res.name);
      if (res.step) setStep(res.step);
      setShow(false);
      form.reset();
    });
  }

  function reset() {
    start(async () => {
      await resetLogin();
      setError("");
      setStep(useGlobal ? "global" : "user");
    });
  }

  return (
    <div className="mx-auto w-full max-w-md">
      {steps.length > 1 && (
        <ol className="mb-12 flex items-start">
          {steps.map((s, i) => (
            <li key={s.key} className={cn("flex items-start", i < steps.length - 1 && "flex-1")}>
              <div className="flex w-20 flex-col items-center gap-2 text-center">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-white",
                    i < current ? "bg-emerald-500" : "bg-brand",
                    i === current && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-card",
                  )}
                >
                  {i < current ? <Check size={16} /> : <s.icon size={16} />}
                </span>
                <span className="text-xs font-semibold text-brand">{s.label}</span>
              </div>
              {i < steps.length - 1 && <span className="mt-4 h-1 flex-1 rounded bg-brand/30" />}
            </li>
          ))}
        </ol>
      )}

      <h1 className="text-3xl font-extrabold text-brand">{TITLES[step][0]}</h1>
      <p className="mt-2 text-muted">{step === "otp" && name ? `${name} - ${TITLES.otp[1]}` : TITLES[step][1]}</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        {step === "global" && (
          <LoginInput icon={Mail} label="Email" name="email" type="email" autoComplete="username" autoFocus />
        )}
        {step === "user" && <LoginInput icon={User} label="User ID" name="userId" placeholder="EA00000001 or your email" autoComplete="username" autoFocus />}
        {step !== "otp" && (
          <LoginInput
            icon={Lock}
            label="Password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            trailing={
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="text-muted">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        )}
        {step === "otp" && <LoginInput icon={Lock} label="Enter Otp" name="otp" inputMode="numeric" autoComplete="one-time-code" placeholder="Enter Otp" autoFocus />}

        {error && (
          <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="bg-brand-gradient h-10 w-full rounded-md text-sm font-bold tracking-wide text-white shadow disabled:opacity-60">
          {pending ? "PLEASE WAIT..." : step === "otp" ? "VERIFY" : "SIGN IN"}
        </button>
      </form>

      {step !== steps[0].key && (
        <p className="mt-5 text-center text-sm">
          Reset to {useGlobal ? "Global" : "User"} Login ?{" "}
          <button type="button" onClick={reset} className="font-bold text-brand underline">
            RESET
          </button>
        </p>
      )}
    </div>
  );
}

function LoginInput({
  icon: Icon,
  label,
  trailing,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail; label: string; trailing?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <span className="flex h-10 items-center gap-2 rounded-md border border-line bg-soft px-3 focus-within:border-brand">
        <Icon size={16} className="text-muted" />
        <input {...props} required className="h-full flex-1 bg-transparent outline-none" />
        {trailing}
      </span>
    </label>
  );
}
