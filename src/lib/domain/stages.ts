import type { StageDefinition, StageKey } from "./types";

// Section 1.1 — the 9 strictly sequential stages.
export const STAGE_DEFINITIONS: StageDefinition[] = [
  { key: "MINISTRY_PROPOSAL", seq: 1, name: "Ministry Proposal", owner_department_code: "MIN", default_sla_days: 15 },
  { key: "ADMIN_APPROVAL", seq: 2, name: "Administrative Approval + Fund Allotment", owner_department_code: "FIN", default_sla_days: 21 },
  { key: "TECH_SANCTION", seq: 3, name: "Technical Sanction", owner_department_code: "RB", default_sla_days: 21 },
  { key: "TENDER", seq: 4, name: "Tender (nProcure)", owner_department_code: "TND", default_sla_days: 45 },
  { key: "WORK_ORDER", seq: 5, name: "Work Order", owner_department_code: "RB", default_sla_days: 7 },
  { key: "SITE_EXECUTION", seq: 6, name: "Site Execution", owner_department_code: "SITE", default_sla_days: 180 },
  { key: "COMPLETION_REPORT", seq: 7, name: "Completion Report", owner_department_code: "RB", default_sla_days: 15 },
  { key: "FINAL_BILL", seq: 8, name: "Final Bill", owner_department_code: "FIN", default_sla_days: 30 },
  { key: "DLP_CLOSURE", seq: 9, name: "Defect Liability Period & Closure", owner_department_code: "RB", default_sla_days: 365 },
];

export const STAGE_BY_KEY: Record<StageKey, StageDefinition> = Object.fromEntries(
  STAGE_DEFINITIONS.map((s) => [s.key, s]),
) as Record<StageKey, StageDefinition>;

export function stageName(key: StageKey): string {
  return STAGE_BY_KEY[key].name;
}

export function stageSeq(key: StageKey): number {
  return STAGE_BY_KEY[key].seq;
}

const SHORT_NAMES: Record<StageKey, string> = {
  MINISTRY_PROPOSAL: "Proposal",
  ADMIN_APPROVAL: "Admin Approval",
  TECH_SANCTION: "Tech Sanction",
  TENDER: "Tender",
  WORK_ORDER: "Work Order",
  SITE_EXECUTION: "Execution",
  COMPLETION_REPORT: "Completion",
  FINAL_BILL: "Final Bill",
  DLP_CLOSURE: "DLP & Closure",
};

export function stageShortName(key: StageKey): string {
  return SHORT_NAMES[key];
}
