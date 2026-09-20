// Core domain types. Mirrors Section 4.1 / 4.2 of docs/DEVELOPMENT_PLAN.md.

export const ROLES = [
  "MINISTRY",
  "DEPT_HEAD",
  "DEPT_OPERATOR",
  "SITE_ENGINEER",
  "SUPER_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

export const STAGE_KEYS = [
  "MINISTRY_PROPOSAL",
  "ADMIN_APPROVAL",
  "TECH_SANCTION",
  "TENDER",
  "WORK_ORDER",
  "SITE_EXECUTION",
  "COMPLETION_REPORT",
  "FINAL_BILL",
  "DLP_CLOSURE",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export type ProjectStatus = "ACTIVE" | "ESCALATED" | "COMPLETED" | "CANCELLED";
export type Priority = "NORMAL" | "HIGH";
export type StageStatus = "ACTIVE" | "APPROVED" | "RETURNED" | "BREACHED";
export type EnteredVia = "FORWARD" | "RETURN" | "REENTRY";

export type MovementAction =
  | "RECEIVED"
  | "FORWARDED"
  | "SUBTASK_OPENED"
  | "SUBTASK_CLOSED"
  | "APPROVED"
  | "RETURNED"
  | "ESCALATED"
  | "REENTERED"
  | "NOTE";

export const BREACH_CAUSES = [
  "DOCUMENTS_PENDING",
  "FUNDS_UNAVAILABLE",
  "TECHNICAL_ISSUE",
  "CONTRACTOR_DELAY",
  "LAND_OR_CLEARANCE",
  "WEATHER",
  "STAFF_SHORTAGE",
  "OTHER",
] as const;
export type BreachCause = (typeof BREACH_CAUSES)[number];

export const DECISION_TYPES = [
  "APPROVE_WITH_NEW_SLA",
  "ORDER_CHANGES",
  "RETURN_TO_STAGE",
  "CANCEL_PROJECT",
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export type EscalationStatus =
  | "AWAITING_JUSTIFICATION"
  | "UNDER_REVIEW"
  | "DECIDED";

export interface Department {
  id: string;
  code: "MIN" | "FIN" | "RB" | "TND" | "SITE";
  name: string;
}

export interface Desk {
  id: string;
  department_id: string;
  designation: string;
  officer_name: string;
  phone: string;
  email: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  department_id: string | null;
  desk_id: string | null;
}

export interface District {
  id: string;
  code: string;
  name: string;
}

export interface StageDefinition {
  key: StageKey;
  seq: number;
  name: string;
  owner_department_code: Department["code"];
  default_sla_days: number;
}

export interface Project {
  id: string;
  project_code: string;
  title: string;
  description: string;
  district_id: string;
  sanctioned_cost: number;
  status: ProjectStatus;
  priority: Priority;
  current_stage_key: StageKey;
  current_stage_instance_id: string | null;
  created_by: string;
  created_at: string;
  assigned_site_engineer_id?: string | null;
}

export interface SlaOverride {
  project_id: string;
  stage_key: StageKey;
  sla_days: number;
}

export interface StageInstance {
  id: string;
  project_id: string;
  stage_key: StageKey;
  attempt_no: number;
  status: StageStatus;
  started_at: string;
  due_at: string;
  ended_at: string | null;
  sla_days: number;
  entered_via: EnteredVia;
  holder_desk_id: string | null;
}

export interface Subtask {
  id: string;
  stage_instance_id: string;
  department_id: string;
  desk_id: string;
  title: string;
  status: "OPEN" | "CLOSED";
  opened_at: string;
  closed_at: string | null;
}

export interface FileMovement {
  id: string;
  project_id: string;
  stage_instance_id: string;
  action: MovementAction;
  from_desk_id: string | null;
  to_desk_id: string | null;
  actor_id: string;
  remark: string;
  created_at: string;
}

export interface Escalation {
  id: string;
  project_id: string;
  stage_instance_id: string;
  breached_at: string;
  status: EscalationStatus;
}

export interface Justification {
  id: string;
  escalation_id: string;
  submitted_by: string;
  cause: BreachCause;
  explanation: string;
  impact: string;
  proposed_fix: string;
  new_eta: string;
  created_at: string;
}

export interface ChatThread {
  id: string;
  escalation_id: string;
  created_by: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Decision {
  id: string;
  escalation_id: string;
  decided_by: string;
  decision_type: DecisionType;
  changes_ordered: string;
  reason: string;
  new_sla_days: number;
  reentry_stage_key: StageKey;
  priority: Priority;
  created_at: string;
}

export interface ExecutionChecklistItem {
  id: string;
  project_id: string;
  title: string;
  planned_start: string;
  planned_end: string;
  weight_pct: number;
  actual_pct: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE";
}

export interface ExecutionReport {
  id: string;
  project_id: string;
  report_type: "DAILY" | "WEEKLY" | "MONTHLY";
  submitted_by: string;
  progress_pct: number;
  remarks: string;
  issues: string;
  photo_paths: string[];
  created_at: string;
}

export type BillStatus = "SUBMITTED" | "VERIFIED" | "PAID";

export interface RaBill {
  id: string;
  project_id: string;
  bill_no: string;
  amount: number;
  submitted_by: string;
  submitted_at: string;
  status: BillStatus;
  paid_at: string | null;
}

export type EotStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface EotRequest {
  id: string;
  project_id: string;
  days_requested: number;
  reason: string;
  status: EotStatus;
  requested_by: string;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface CompletionReport {
  id: string;
  project_id: string;
  work_done_summary: string;
  total_billed: number;
  dues: number;
  problems_faced: string;
  delay_days: number;
  delay_reasons: string;
  signed_by: string;
  ai_drafted: boolean;
  created_at: string;
}

export interface Database {
  departments: Department[];
  desks: Desk[];
  profiles: Profile[];
  districts: District[];
  projects: Project[];
  project_sla_overrides: SlaOverride[];
  stage_instances: StageInstance[];
  subtasks: Subtask[];
  file_movements: FileMovement[];
  escalations: Escalation[];
  justifications: Justification[];
  chat_threads: ChatThread[];
  chat_messages: ChatMessage[];
  decisions: Decision[];
  execution_checklist_items: ExecutionChecklistItem[];
  execution_reports: ExecutionReport[];
  ra_bills: RaBill[];
  eot_requests: EotRequest[];
  completion_reports: CompletionReport[];
  system_clock: { id: 1; offset_minutes: number };
  seq_counters: Record<string, number>;
}
