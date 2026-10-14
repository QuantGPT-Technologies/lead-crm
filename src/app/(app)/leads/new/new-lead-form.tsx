"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, btn } from "@/components/ui";
import { toast } from "@/components/toast";
import type { Lookups } from "@/lib/types";
import { createLead } from "../actions";
import {
  initialValues,
  payload,
  SectionFields,
  type FormValues,
  type Section,
} from "../lead-fields";

const SECTIONS: [Section, string][] = [
  ["client", "Contact details"],
  ["lead", "Interests & source"],
  ["stage", "Pipeline stage"],
  ["location", "Location"],
  ["professional", "Education & work"],
  ["internals", "Team & ownership"],
];

export function NewLeadForm({
  lookups,
  isStaff,
  selfId,
}: {
  lookups: Lookups;
  isStaff: boolean;
  selfId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<FormValues>(() => ({
    ...initialValues(
      SECTIONS.map(([s]) => s),
      null,
      lookups,
    ),
    owner_id: selfId,
    stage_id: lookups.stages[0]?.id ?? "",
    _funnel: lookups.stages[0]?.funnel_id ?? "",
  }));

  return (
    <form
      className="mx-auto max-w-5xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createLead(payload(values));
          if (res.error) return toast(res.error, "error");
          toast("Lead created");
          router.push(`/leads/${res.id}`);
        });
      }}
    >
      {SECTIONS.map(([section, title]) => (
        <Card key={section} className="p-5 sm:p-6">
          {section === "client" ? (
            <>
              <h2 className="mb-2 text-base font-semibold">{title}</h2>
              <p className="mb-5 text-xs text-muted">
                Start with a name and mobile number. Everything else can follow.
              </p>
              <SectionFields
                section={section}
                values={values}
                onChange={setValues}
                lookups={lookups}
                isStaff={isStaff}
                enforceRequired={false}
              />
            </>
          ) : (
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-xs text-muted group-open:hidden">
                  Add details +
                </span>
                <span className="hidden text-xs text-muted group-open:block">
                  Collapse −
                </span>
              </summary>
              <div className="mt-5 border-t border-line pt-5">
                <SectionFields
                  section={section}
                  values={values}
                  onChange={setValues}
                  lookups={lookups}
                  isStaff={isStaff}
                  enforceRequired={false}
                />
              </div>
            </details>
          )}
        </Card>
      ))}
      <div className="sticky bottom-4 flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-4 shadow-lg">
        <span className="hidden text-xs text-muted sm:block">
          Only name and mobile are required to get started.
        </span>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating lead…" : "Create lead"}
          </Button>
          <Link href="/leads" className={btn("outline")}>
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}
