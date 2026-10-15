export const LEAD_CATEGORIES = ["A", "B", "C", "D"] as const;
export const CATEGORY_OPTIONS = LEAD_CATEGORIES.map((value) => ({ value, label: `Category ${value}` }));
