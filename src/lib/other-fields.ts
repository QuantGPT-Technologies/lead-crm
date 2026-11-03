import type { Lookups } from "@/lib/types";

export const CUSTOM_DROPDOWNS = ["source_id", "university_id", "course_id", "stage_id", "sub_stage_id", "gender", "priority"];
export const equalOtherFields = (a: Record<string, string> = {}, b: Record<string, string> = {}) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export function otherFields(values: Record<string, unknown>, lookups: Lookups, fields: readonly string[], existing: Record<string, string> = {}) {
  const next = { ...existing };
  const supplied = values.other_fields && typeof values.other_fields === "object" && !Array.isArray(values.other_fields) ? values.other_fields as Record<string, unknown> : {};
  const lists: Record<string, { id: string; name: string }[]> = { source_id: lookups.sources, university_id: lookups.universities, course_id: lookups.courses, stage_id: lookups.stages, sub_stage_id: lookups.subStages };
  for (const field of CUSTOM_DROPDOWNS) {
    if (!fields.includes(field) || !(field in values)) continue;
    const isOther = ["gender", "priority"].includes(field) ? values[field] === "other" : lists[field]?.some(option => option.id === values[field] && option.name.toLowerCase() === "other");
    if (isOther) {
      const text = typeof supplied[field] === "string" ? supplied[field].trim() : "";
      if (!text || text.length > 200) return { error: `Enter Other ${field.replace("_id", "").replace("_", " ")} (1–200 characters)` };
      next[field] = text;
    } else delete next[field];
  }
  return { fields: next };
}
