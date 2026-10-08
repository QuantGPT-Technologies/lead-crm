export interface MasterField {
  name: string;
  label: string;
  type?: "text" | "number" | "color" | "checkbox" | "textarea" | "select";
  required?: boolean;
  /** another master table to pick from, or a fixed list of values */
  ref?: MasterTable;
  choices?: string[];
}

export type MasterTable = "lead_sources" | "universities" | "courses" | "stage_funnels" | "stages" | "sub_stages" | "message_templates";

/** Every admin-editable lookup table. The same definition drives the form and the server-side whitelist. */
export const MASTERS: Record<MasterTable, { label: string; order: string; fields: MasterField[] }> = {
  lead_sources: { label: "Lead Sources", order: "name", fields: [{ name: "name", label: "Name", required: true }] },
  universities: { label: "Universities", order: "name", fields: [{ name: "name", label: "Name", required: true }] },
  courses: {
    label: "Courses",
    order: "name",
    fields: [
      { name: "university_id", label: "University", type: "select", ref: "universities", required: true },
      { name: "name", label: "Course Name", required: true },
      { name: "fee", label: "Fee", type: "number" },
    ],
  },
  stage_funnels: {
    label: "Stage Funnels",
    order: "sort_order",
    fields: [
      { name: "name", label: "Name", required: true },
      { name: "sort_order", label: "Order", type: "number" },
    ],
  },
  stages: {
    label: "Stages",
    order: "sort_order",
    fields: [
      { name: "funnel_id", label: "Funnel", type: "select", ref: "stage_funnels", required: true },
      { name: "name", label: "Stage Name", required: true },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "color", label: "Colour", type: "color" },
      { name: "is_won", label: "Counts as enrolled (won)", type: "checkbox" },
      { name: "is_lost", label: "Counts as lost", type: "checkbox" },
    ],
  },
  sub_stages: {
    label: "Sub Stages",
    order: "sort_order",
    fields: [
      { name: "stage_id", label: "Stage", type: "select", ref: "stages", required: true },
      { name: "name", label: "Sub Stage Name", required: true },
      { name: "sort_order", label: "Order", type: "number" },
    ],
  },
  message_templates: {
    label: "Message Templates",
    order: "name",
    fields: [
      { name: "channel", label: "Channel", type: "select", choices: ["email", "sms", "whatsapp"], required: true },
      { name: "name", label: "Template Name", required: true },
      { name: "subject", label: "Subject (email only)" },
      { name: "body", label: "Body - use {{name}} {{course}} {{university}} {{agent}}", type: "textarea", required: true },
    ],
  },
};
