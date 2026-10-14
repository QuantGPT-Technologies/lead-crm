import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";
export { Modal } from "./modal";

type Variant = "primary" | "outline" | "danger" | "ghost" | "success";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white dark:text-bg hover:brightness-110",
  outline: "border border-line bg-card text-fg hover:bg-soft",
  danger: "border border-red-500 text-red-600 hover:bg-red-500/10",
  success: "bg-brand text-white dark:text-bg hover:brightness-110",
  ghost: "text-muted hover:bg-soft hover:text-fg",
};

export const btn = (variant: Variant = "primary", className?: string) =>
  cn(
    "ui-button inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    className,
  );

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button type="button" {...props} className={btn(variant, className)} />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("ui-card", className)}>{children}</div>;
}

const DESCRIPTIONS: Record<string, string> = {
  "Upload Leads": "Bring your next batch of leads into the workspace.",
  "Distribute Leads": "Give every lead a clear owner and a next step.",
  "Message Log": "Keep every conversation connected to the people behind it.",
  Templates: "Thoughtful messages, ready when you need them.",
  Users: "The people who make your workspace move forward.",
  Masters: "Shape the courses, sources, and stages behind your workflow.",
  Settings: "Make this workspace work for your team.",
  "Search Lead": "Find the person behind your next conversation.",
  Followups: "The right conversation, at the right time.",
  Enrolled: "Every enrollment is a new beginning. Track progress and payments.",
  Opportunity: "Turn promising conversations into your next enrollment.",
  Opportunities: "Turn promising conversations into your next enrollment.",
  Upload: "Bring your next batch of leads into the workspace.",
  Distribute: "Give every lead a clear owner and a next step.",
  "Data Allotment": "Balance workloads and keep your team moving.",
  "Lead Reports": "See what is working, and where to focus next.",
  "Agent Performance": "A closer look at your team’s progress.",
  "Activity Log": "Stay connected to what is happening across your team.",
  "My Profile": "Your details, preferences, and account security.",
  "Add New Lead": "Start a new relationship with the details that matter.",
};
const TITLES: Record<string, string> = {
  "Upload Leads": "Import leads",
  "Distribute Leads": "Distribute leads",
  "Data Allotment": "Assignments",
  "Lead Reports": "Reports",
  "Agent Performance": "Team performance",
  "Message Log": "Messages",
  Users: "Team members",
  Masters: "Data & stages",
  "Add New Lead": "New lead",
  Enrolled: "Enrollments",
  Opportunity: "Opportunities",
  "Search Lead": "Find a lead",
  Followups: "Follow-ups",
};
export function PageHeader({
  title,
  children,
  description,
}: {
  title: string;
  children?: ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">Your workspace</p>
        <h1 className="text-[28px] font-semibold leading-tight">
          {TITLES[title] ?? title}
        </h1>
        {(description || DESCRIPTIONS[title]) && (
          <p className="mt-2 text-sm text-muted">
            {description || DESCRIPTIONS[title]}
          </p>
        )}
      </div>
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
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
  placeholder?: string | null;
}) {
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

export function Badge({
  color = "#285b43",
  children,
}: {
  color?: string;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center text-muted">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft">
        <Inbox size={23} strokeWidth={1.5} />
      </span>
      <div className="max-w-sm text-sm">{children}</div>
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
        Showing {total === 0 ? 0 : (page - 1) * size + 1}-
        {Math.min(page * size, total)} of {total} rows
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
