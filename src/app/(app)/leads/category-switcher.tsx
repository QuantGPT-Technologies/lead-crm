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
}: {
  current: Record<string, string | undefined>;
  path?: string;
}) {
  const active = VIEWS.some((view) => view.value === current.category)
    ? current.category
    : "";

  return (
    <nav aria-label="Lead categories" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold text-muted">Categories</span>
      {VIEWS.map((view) => {
        const params = new URLSearchParams();
        Object.entries({ ...current, category: view.value }).forEach(([key, value]) => {
          if (value && key !== "page") params.set(key, value);
        });
        const selected = active === view.value;
        return (
          <Link
            key={view.value}
            href={params.size ? `${path}?${params}` : path}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
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
