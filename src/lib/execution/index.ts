// Pure execution-stage maths: checklist template, planned vs actual progress,
// report compliance and delay attribution. No I/O — unit tested.
import { addDays, daysBetween } from "@/lib/sla";
import type {
  Decision,
  EotRequest,
  Escalation,
  ExecutionChecklistItem,
  ExecutionReport,
  RaBill,
  StageInstance,
} from "@/lib/domain/types";

export interface ChecklistTemplateItem {
  title: string;
  weight_pct: number;
}

/** Phase 4 task 1 — the template applied when the Work Order is approved. */
export const CHECKLIST_TEMPLATE: ChecklistTemplateItem[] = [
  { title: "Site clearance & setting out", weight_pct: 10 },
  { title: "Foundation & sub-structure", weight_pct: 25 },
  { title: "Structure / pavement layers", weight_pct: 35 },
  { title: "Finishing & services", weight_pct: 20 },
  { title: "Handover & snag clearing", weight_pct: 10 },
];

/** Spreads the template across the stage SLA, weighted by each item's share. */
export function buildChecklist(
  projectId: string,
  startedAt: string | Date,
  slaDays: number,
  makeId: (index: number) => string,
): ExecutionChecklistItem[] {
  const start = new Date(startedAt);
  let offset = 0;
  return CHECKLIST_TEMPLATE.map((item, i) => {
    const span = Math.max(1, Math.round((slaDays * item.weight_pct) / 100));
    const row: ExecutionChecklistItem = {
      id: makeId(i),
      project_id: projectId,
      title: item.title,
      planned_start: addDays(start, offset).toISOString(),
      planned_end: addDays(start, offset + span).toISOString(),
      weight_pct: item.weight_pct,
      actual_pct: 0,
      status: "NOT_STARTED",
    };
    offset += span;
    return row;
  });
}

export interface ProgressState {
  plannedPct: number;
  actualPct: number;
  variancePct: number;
  /** Schedule Performance Index — actual / planned. Phase 6 reuses this. */
  spi: number;
}

export function progressState(
  checklist: ExecutionChecklistItem[],
  now: Date,
): ProgressState {
  const actualPct = checklist.reduce((a, c) => a + (c.weight_pct * c.actual_pct) / 100, 0);
  const plannedPct = checklist.reduce((a, c) => {
    const start = new Date(c.planned_start).getTime();
    const end = new Date(c.planned_end).getTime();
    const frac = Math.min(1, Math.max(0, (now.getTime() - start) / Math.max(end - start, 1)));
    return a + c.weight_pct * frac;
  }, 0);
  return {
    plannedPct: Math.round(plannedPct),
    actualPct: Math.round(actualPct),
    variancePct: Math.round(actualPct - plannedPct),
    spi: plannedPct > 0 ? Number((actualPct / plannedPct).toFixed(2)) : 1,
  };
}

export interface ComplianceState {
  expected: number;
  submitted: number;
  missed: number;
  level: "GREEN" | "AMBER" | "RED";
}

/** One weekly report is expected per 7 days since the stage started. */
export function reportCompliance(
  reports: ExecutionReport[],
  startedAt: string | Date,
  now: Date,
): ComplianceState {
  const weeks = Math.max(0, Math.floor(daysBetween(new Date(startedAt), now) / 7));
  const submitted = reports.filter((r) => r.report_type === "WEEKLY").length;
  const missed = Math.max(0, weeks - submitted);
  return {
    expected: weeks,
    submitted,
    missed,
    level: missed === 0 ? "GREEN" : missed <= 2 ? "AMBER" : "RED",
  };
}

export interface DelayAttribution {
  delayDays: number;
  reasons: string[];
  totalBilled: number;
  dues: number;
}

/**
 * Phase 4 task 4 — delay days and their reasons, computed from the project's
 * own history so the Completion Report can pre-fill itself.
 */
export function delayAttribution(args: {
  instances: StageInstance[];
  escalations: Escalation[];
  decisions: Decision[];
  eots: EotRequest[];
  bills: RaBill[];
  now: Date;
  stageNameOf: (instance: StageInstance) => string;
}): DelayAttribution {
  const { instances, escalations, decisions, eots, bills, now } = args;

  // Every stage visit that ran past its due date contributes its overrun.
  let delayDays = 0;
  const reasons: string[] = [];
  for (const inst of instances) {
    const end = inst.ended_at ? new Date(inst.ended_at) : now;
    const over = daysBetween(new Date(inst.due_at), end);
    if (over > 0) {
      delayDays += Math.round(over);
      reasons.push(args.stageNameOf(inst) + ": " + Math.round(over) + " days beyond its SLA");
    }
  }

  for (const esc of escalations) {
    const decision = decisions.find((d) => d.escalation_id === esc.id);
    reasons.push(
      "SLA breach escalated to the Ministry" +
        (decision ? " — decision: " + decision.decision_type.replace(/_/g, " ").toLowerCase() : " — awaiting decision"),
    );
  }

  for (const eot of eots.filter((e) => e.status === "APPROVED")) {
    reasons.push("Extension of time granted: " + eot.days_requested + " days — " + eot.reason);
  }

  const totalBilled = bills.reduce((a, b) => a + b.amount, 0);
  const dues = bills.filter((b) => b.status !== "PAID").reduce((a, b) => a + b.amount, 0);

  return { delayDays, reasons, totalBilled, dues };
}
