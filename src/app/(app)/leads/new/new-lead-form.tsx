"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, btn } from "@/components/ui";
import { toast } from "@/components/toast";
import type { Lookups } from "@/lib/types";
import { createLead } from "../actions";
import { initialValues, payload, SectionFields, type FormValues, type Section } from "../lead-fields";

const SECTIONS: [Section, string][] = [
  ["client", "Client"],
  ["lead", "Lead"],
  ["stage", "Stage"],
  ["location", "Location"],
  ["professional", "Professional"],
  ["internals", "Internals"],
];

export function NewLeadForm({ lookups, isStaff, selfId }: { lookups: Lookups; isStaff: boolean; selfId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<FormValues>(() => ({
    ...initialValues(SECTIONS.map(([s]) => s), null, lookups),
    owner_id: selfId,
    stage_id: lookups.stages[0]?.id ?? "",
    _funnel: lookups.stages[0]?.funnel_id ?? "",
  }));

  return (
    <form
      className="space-y-4"
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
        <Card key={section} className="p-4">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-brand">{title}</h2>
          {/* only name + mobile are mandatory when a lead is first captured */}
          <SectionFields section={section} values={values} onChange={setValues} lookups={lookups} isStaff={isStaff} enforceRequired={false} />
        </Card>
      ))}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Submit"}
        </Button>
        <Link href="/leads" className={btn("danger")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
