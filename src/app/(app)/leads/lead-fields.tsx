"use client";

import { Field, Select } from "@/components/ui";
import type { Lead, Lookups } from "@/lib/types";

export type FormValues = Record<string, string | boolean>;
export type Section = "client" | "lead" | "stage" | "location" | "internals" | "professional";

type Opt = { value: string; label: string };
interface FieldDef {
  name: string;
  label: string;
  type?: "text" | "tel" | "email" | "date" | "number" | "textarea" | "select" | "checkbox";
  required?: boolean;
  staffOnly?: boolean;
  wide?: boolean;
  options?: (v: FormValues, lk: Lookups) => Opt[];
  /** fields to clear when this one changes (dependent dropdowns) */
  resets?: string[];
}

const named = (list: { id: string; name: string }[]): Opt[] => list.map((x) => ({ value: x.id, label: x.name }));
const fixed = (...values: string[]): Opt[] => values.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

export const SECTION_FIELDS: Record<Section, FieldDef[]> = {
  client: [
    { name: "student_name", label: "Student Name", required: true },
    { name: "mobile", label: "Mobile", type: "tel", required: true },
    { name: "alt_mobile", label: "Alternate Mobile", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    { name: "gender", label: "Gender", type: "select", options: () => fixed("male", "female", "other") },
    { name: "dob", label: "Date of Birth", type: "date" },
    { name: "dnd", label: "Do Not Disturb", type: "checkbox" },
  ],
  lead: [
    { name: "source_id", label: "Source", type: "select", options: (_, lk) => named(lk.sources) },
    { name: "source_desc", label: "Source Desc" },
    { name: "campaign", label: "Campaign" },
    { name: "medium", label: "Medium" },
    { name: "product", label: "Product" },
    { name: "priority", label: "Priority", type: "select", options: () => fixed("hot", "warm", "cold") },
  ],
  stage: [
    { name: "university_id", label: "University", type: "select", required: true, options: (_, lk) => named(lk.universities), resets: ["course_id"] },
    { name: "course_id", label: "Course", type: "select", required: true, options: (v, lk) => named(lk.courses.filter((c) => c.university_id === v.university_id)) },
    { name: "_funnel", label: "Stage Funnel", type: "select", options: (_, lk) => named(lk.funnels), resets: ["stage_id", "sub_stage_id"] },
    { name: "stage_id", label: "Stage", type: "select", required: true, options: (v, lk) => named(lk.stages.filter((s) => !v._funnel || s.funnel_id === v._funnel)), resets: ["sub_stage_id"] },
    { name: "sub_stage_id", label: "Sub Stage", type: "select", required: true, options: (v, lk) => named(lk.subStages.filter((s) => s.stage_id === v.stage_id)) },
    { name: "remarks", label: "Remarks" },
  ],
  location: [
    { name: "country", label: "Country" },
    { name: "state", label: "State" },
    { name: "city", label: "City" },
    { name: "pincode", label: "Pincode" },
    { name: "address", label: "Address", type: "textarea", wide: true },
  ],
  internals: [
    { name: "owner_id", label: "Lead Owner", type: "select", staffOnly: true, options: (_, lk) => lk.users.map((u) => ({ value: u.id, label: `${u.full_name} (${u.emp_code})` })) },
    { name: "internal_notes", label: "Internal Notes", type: "textarea", wide: true },
  ],
  professional: [
    { name: "qualification", label: "Highest Qualification" },
    { name: "company", label: "Company" },
    { name: "designation", label: "Designation" },
    { name: "experience_years", label: "Experience (years)", type: "number" },
  ],
};

/** Form state for the given sections, taken from a lead (or blank for a new one). */
export function initialValues(sections: Section[], lead: Partial<Lead> | null, lk: Lookups): FormValues {
  const v: FormValues = {};
  for (const s of sections)
    for (const f of SECTION_FIELDS[s]) {
      const raw = lead ? (lead as Record<string, unknown>)[f.name] : undefined;
      v[f.name] = f.type === "checkbox" ? raw === true : raw == null ? "" : String(raw);
    }
  if (sections.includes("stage")) v._funnel = lk.stages.find((s) => s.id === v.stage_id)?.funnel_id ?? "";
  if (!lead && "priority" in v) v.priority = "warm";
  if (!lead && "country" in v) v.country = "India";
  return v;
}

/** Values to send to the server: drops UI-only keys such as the funnel picker. */
export const payload = (v: FormValues) => Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("_")));

export function SectionFields({
  section,
  values,
  onChange,
  lookups,
  isStaff,
  enforceRequired = true,
}: {
  section: Section;
  values: FormValues;
  onChange: (next: FormValues) => void;
  lookups: Lookups;
  isStaff: boolean;
  enforceRequired?: boolean;
}) {
  const set = (f: FieldDef, value: string | boolean) => {
    const next = { ...values, [f.name]: value };
    f.resets?.forEach((r) => (next[r] = ""));
    onChange(next);
  };

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {SECTION_FIELDS[section]
        .filter((f) => !f.staffOnly || isStaff)
        .map((f) => {
          const required = !!f.required && (enforceRequired || section === "client");
          const options = f.options?.(values, lookups) ?? [];
          // a sub stage is only required when the chosen stage actually has some
          const needed = required && !(f.name === "sub_stage_id" && options.length === 0);
          const common = { name: f.name, required: needed, "aria-label": f.label };

          if (f.type === "checkbox") {
            return (
              <label key={f.name} className="flex items-center gap-2 self-end pb-2 font-semibold">
                <input type="checkbox" checked={values[f.name] === true} onChange={(e) => set(f, e.target.checked)} />
                {f.label}
              </label>
            );
          }
          return (
            <Field key={f.name} label={f.label} required={needed} className={f.wide ? "sm:col-span-2" : undefined}>
              {f.type === "select" ? (
                <Select {...common} value={String(values[f.name] ?? "")} onChange={(e) => set(f, e.target.value)} options={options} />
              ) : f.type === "textarea" ? (
                <textarea {...common} rows={3} value={String(values[f.name] ?? "")} onChange={(e) => set(f, e.target.value)} className="input" />
              ) : (
                <input
                  {...common}
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "0.5" : undefined}
                  min={f.type === "number" ? 0 : undefined}
                  placeholder={`Enter ${f.label}`}
                  value={String(values[f.name] ?? "")}
                  onChange={(e) => set(f, e.target.value)}
                  className="input"
                />
              )}
            </Field>
          );
        })}
    </div>
  );
}
