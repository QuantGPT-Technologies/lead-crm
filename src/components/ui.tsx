import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "outline" | "danger" | "ghost" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white hover:brightness-110",
  outline: "border border-brand text-brand hover:bg-brand/10",
  danger: "border border-red-500 text-red-600 hover:bg-red-500/10",
  success: "bg-emerald-600 text-white hover:brightness-110",
  ghost: "text-muted hover:bg-soft hover:text-fg",
};

export const btn = (variant: Variant = "primary", className?: string) =>
  cn(
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    className,
  );

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={btn(variant, className)} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-line bg-card shadow-sm", className)}>{children}</div>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-extrabold">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-sm font-semibold">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

export function Select({
  options,
  placeholder = "Select an option",
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string | null }) {
  return (
    <select {...props} className={cn("input", className)}>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Badge({ color = "#6366f1", children }: { color?: string; children: ReactNode }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-muted">{children}</div>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("w-full rounded-lg border border-line bg-card shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-xl leading-none text-muted hover:text-fg">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Server-rendered pager that keeps the other query params. */
export function Pager({
  page,
  size,
  total,
  params,
  path,
}: {
  page: number;
  size: number;
  total: number;
  params: Record<string, string | undefined>;
  path: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("page", String(p));
    return `${path}?${sp}`;
  };
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="text-muted">
        Showing {total === 0 ? 0 : (page - 1) * size + 1}-{Math.min(page * size, total)} of {total} rows
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn("outline", "h-8")}>
            Prev
          </Link>
        ) : null}
        <span className="font-semibold">
          Page {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={btn("outline", "h-8")}>
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}
