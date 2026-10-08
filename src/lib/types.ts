export type Role = "admin" | "manager" | "agent";

export interface Profile {
  id: string;
  emp_code: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Named {
  id: string;
  name: string;
}
export interface Course extends Named {
  university_id: string;
  fee: number | null;
}
export interface Stage extends Named {
  funnel_id: string;
  color: string;
  sort_order: number;
  is_won: boolean;
  is_lost: boolean;
}
export interface SubStage extends Named {
  stage_id: string;
}
export interface Template extends Named {
  channel: "email" | "sms" | "whatsapp";
  subject: string | null;
  body: string;
}

export interface Lookups {
  sources: Named[];
  universities: Named[];
  courses: Course[];
  funnels: Named[];
  stages: Stage[];
  subStages: SubStage[];
  users: Pick<Profile, "id" | "full_name" | "emp_code" | "role">[];
  templates: Template[];
}

export interface Lead {
  id: string;
  lead_no: string;
  student_name: string;
  mobile: string;
  alt_mobile: string | null;
  email: string | null;
  gender: string | null;
  dob: string | null;
  dnd: boolean;
  source_id: string | null;
  source_desc: string | null;
  campaign: string | null;
  medium: string | null;
  product: string | null;
  priority: "hot" | "warm" | "cold";
  university_id: string | null;
  course_id: string | null;
  stage_id: string | null;
  sub_stage_id: string | null;
  remarks: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  pincode: string | null;
  address: string | null;
  qualification: string | null;
  company: string | null;
  designation: string | null;
  experience_years: number | null;
  owner_id: string | null;
  allotted_at: string | null;
  internal_notes: string | null;
  attempt_count: number;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  rechurn_count: number;
  last_rechurned_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  type: string;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string } | null;
}

export type ActionResult = { error?: string; id?: string; message?: string };

export type Row = Record<string, unknown> & { id: string };
