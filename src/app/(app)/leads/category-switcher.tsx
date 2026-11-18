import Link from "next/link";
import { CATEGORY_OPTIONS } from "@/lib/lead-categories";
import { cn } from "@/lib/utils";

const VIEWS = [
  { value: "", label: "All" },
  ...CATEGORY_OPTIONS,
  { value: "none", label: "Uncategorized" },
];

export function CategorySwitcher({
  current,
  path = "/leads",
  compact = false,
}: {
  current: Record<string, string | undefined>;
  path?: string;
  /** Small pills without the label, for tight toolbars. */
  compact?: boolean;
}) {
  const active = VIEWS.some((view) => view.value === current.category)
    ? current.category
    : "";

  return (
    <nav aria-label="Lead categories" className={cn("flex flex-wrap items-center", compact ? "gap-1" : "gap-2")}>
      {!compact && <span className="mr-1 text-xs font-semibold text-muted">Categories</span>}
      {VIEWS.map((view) => {
        const params = new URLSearchParams();
        Object.entries({ ...current, category: view.value }).forEach(([key, value]) => {
          if (value && key !== "page") params.set(key, value);
        });
        const selected = active === view.value;
        return (
          <Link
            key={view.value}
            href={params.size ? `${path}?${params}` : `${path}?view=all`}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "rounded-lg border font-semibold transition-colors",
              compact ? "h-8 px-2.5 text-xs leading-[30px]" : "px-4 py-2 text-sm",
              selected
                ? "border-brand bg-brand text-white dark:text-bg"
                : "border-line bg-card text-muted hover:border-brand hover:text-brand",
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
