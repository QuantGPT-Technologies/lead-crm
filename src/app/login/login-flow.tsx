"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { globalLogin, resetLogin, userLogin, verifyOtp } from "./actions";

type Step = "global" | "user" | "otp";

const TITLES: Record<Step, [string, string]> = {
  global: [
    "Welcome to your workspace.",
    "Start with your company email and password.",
  ],
  user: [
    "Make yourself at home.",
    "Sign in with your user ID or email to get started.",
  ],
  otp: ["One last step.", "Enter the verification code we sent to your email."],
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
    ...(useGlobal
      ? [{ key: "global" as Step, label: "Workspace", icon: Globe }]
      : []),
    { key: "user" as Step, label: "Your account", icon: User },
    ...(useOtp
      ? [{ key: "otp" as Step, label: "Verification", icon: KeyRound }]
      : []),
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
        <ol className="mb-10 flex items-start" aria-label="Sign-in progress">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className={cn(
                "flex items-start",
                i < steps.length - 1 && "flex-1",
              )}
            >
              <div className="flex w-20 flex-col items-center gap-2 text-center">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    i <= current
                      ? "bg-brand text-white dark:text-bg"
                      : "bg-soft text-muted",
                  )}
                >
                  {i < current ? <Check size={16} /> : <s.icon size={16} />}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[10px] font-semibold",
                    i <= current ? "text-brand" : "text-muted",
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span className="mx-3 mt-4 h-px flex-1 bg-line" />
              )}
            </li>
          ))}
        </ol>
      )}

      <h1 className="text-[30px] font-semibold leading-tight">
        {TITLES[step][0]}
      </h1>
      <p className="mt-2 text-muted">
        {step === "otp" && name
          ? `${name} - ${TITLES.otp[1]}`
          : TITLES[step][1]}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        {step === "global" && (
          <LoginInput
            icon={Mail}
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
          />
        )}
        {step === "user" && (
          <LoginInput
            icon={User}
            label="User ID"
            name="userId"
            placeholder="EA00000001 or your email"
            autoComplete="username"
            autoFocus
          />
        )}
        {step !== "otp" && (
          <LoginInput
            icon={Lock}
            label="Password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            trailing={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="text-muted"
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        )}
        {step === "otp" && (
          <LoginInput
            icon={Lock}
            label="Verification code"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            autoFocus
          />
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="ui-button h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white dark:text-bg disabled:opacity-60"
        >
          {pending
            ? "Signing you in…"
            : step === "otp"
              ? "Verify and continue"
              : "Continue to workspace →"}
        </button>
      </form>

      {step !== steps[0].key && (
        <p className="mt-5 text-center text-sm">
          Signing into a different workspace?{" "}
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="font-semibold text-brand underline underline-offset-4"
          >
            Start again
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
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: typeof Mail;
  label: string;
  trailing?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <span className="login-input flex h-12 items-center gap-3 rounded-xl border border-line bg-card px-4 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/10">
        <Icon size={16} className="text-muted" />
        <input
          {...props}
          required
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
        />
        {trailing}
      </span>
    </label>
  );
}
