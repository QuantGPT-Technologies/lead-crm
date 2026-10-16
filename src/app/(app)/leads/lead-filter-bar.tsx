"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FilterX, Search, SlidersHorizontal } from "lucide-react";
import { Button, Field, Select } from "@/components/ui";
import type { Lookups } from "@/lib/types";

const ATTEMPTS = [
  { value: "0", label: "Not attempted" },
  { value: "1", label: "1 attempt" },
  { value: "2", label: "2 attempts" },
  { value: "3+", label: "3 or more" },
];
const PRIORITIES = ["hot", "warm", "cold"].map((p) => ({
  value: p,
  label: p[0].toUpperCase() + p.slice(1),
}));
const KEEP = ["size", "sort", "dir"];

/** Quick filters + advanced filter panel. Every filter lives in the URL so views can be bookmarked and shared. */
export function LeadFilterBar({
  lookups,
  current,
  isStaff,
  isAdmin = false,
}: {
  lookups: Lookups;
  current: Record<string, string | undefined>;
  isStaff: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const opts = (list: { id: string; name: string }[]) =>
    list.map((x) => ({ value: x.id, label: x.name }));
  const owners = [
    ...(isAdmin ? [{ value: "none", label: "Unassigned" }] : []),
    ...lookups.users.map((u) => ({ value: u.id, label: u.full_name })),
  ];
  const courses = lookups.courses.filter(
    (c) => !current.university || c.university_id === current.university,
  );

  function apply(changes: Record<string, string>) {
    const next = { ...current, ...changes };
    const sp = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && sp.set(k, v));
    router.push(`${pathname}?${sp}`);
  }

  const clear = () => {
    const sp = new URLSearchParams();
    KEEP.forEach((k) => current[k] && sp.set(k, current[k]!));
    router.push(`${pathname}?${sp}`);
  };

  const quick = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Select
      aria-label={label}
      value={current[key] ?? ""}
      onChange={(e) => apply({ [key]: e.target.value })}
      options={options}
      placeholder={label}
      className="!h-10 !w-auto min-w-28"
    />
  );
  const activeCount = Object.entries(current).filter(
    ([k, v]) => v && !KEEP.includes(k),
  ).length;

  return (
    <>
      <form
        key={current.q ?? ""}
        className="relative w-full sm:w-56"
        onSubmit={(e) => {
          e.preventDefault();
          apply({
            q: String(new FormData(e.currentTarget).get("q") ?? "").trim(),
          });
        }}
      >
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          name="q"
          defaultValue={current.q}
          aria-label="Search leads"
          placeholder="Search name, mobile, email…"
          className="input !pl-9"
        />
      </form>
      {quick("stage", "Stage", opts(lookups.stages))}
      {quick("source", "Source", opts(lookups.sources))}
      <Button
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <SlidersHorizontal size={15} /> Filters
        {activeCount ? ` (${activeCount})` : ""}
      </Button>
      {activeCount > 0 && (
        <Button variant="ghost" onClick={clear}>
          <FilterX size={15} /> Clear
        </Button>
      )}

      {open && (
        <form
          className="order-last grid w-full grid-cols-2 gap-3 border-t border-line pt-3 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            apply(
              Object.fromEntries(
                [...f.entries()].map(([k, v]) => [k, String(v).trim()]),
              ),
            );
          }}
        >
          <Field label="Search">
            <input
              name="q"
              defaultValue={current.q}
              placeholder="Name, mobile, email, lead no"
              className="input"
            />
          </Field>
          <Field label="Product">
            <input
              name="product"
              defaultValue={current.product}
              className="input"
            />
          </Field>
          <Field label="Contact attempts">
            <Select
              name="attempt"
              defaultValue={current.attempt ?? ""}
              options={ATTEMPTS}
              placeholder="Any number"
            />
          </Field>
          <Field label="University">
            <Select
              name="university"
              defaultValue={current.university ?? ""}
              options={opts(lookups.universities)}
              placeholder="All"
            />
          </Field>
          <Field label="Course">
            <Select
              name="course"
              defaultValue={current.course ?? ""}
              options={opts(courses)}
              placeholder="All"
            />
          </Field>
          {isStaff && (
            <Field label="Lead Owner">
              <Select
                name="owner"
                defaultValue={current.owner ?? ""}
                options={owners}
                placeholder="All"
              />
            </Field>
          )}
          <Field label="Priority">
            <Select
              name="priority"
              defaultValue={current.priority ?? ""}
              options={PRIORITIES}
              placeholder="All"
            />
          </Field>
          <Field label="Created from">
            <input
              type="date"
              name="from"
              defaultValue={current.from}
              className="input"
            />
          </Field>
          <Field label="Created to">
            <input
              type="date"
              name="to"
              defaultValue={current.to}
              className="input"
            />
          </Field>
          <div className="col-span-full flex gap-2">
            <Button type="submit">Apply filters</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
