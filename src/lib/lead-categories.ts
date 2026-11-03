export const LEAD_CATEGORIES = ["A", "B", "C", "D", "UT"] as const;
export type LeadCategory = (typeof LEAD_CATEGORIES)[number];
export const isLeadCategory = (value: string): value is LeadCategory =>
  LEAD_CATEGORIES.some((category) => category === value);
export const CATEGORY_OPTIONS = LEAD_CATEGORIES.map((value) => ({ value, label: `Category ${value}` }));
