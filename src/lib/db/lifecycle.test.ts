/**
 * Phase 4 acceptance: a project taken from Stage 1 to closure in one run,
 * with reports, an approved extension of time, and a completion report that
 * fills its own delay figures.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDb, setClockOffset, shiftClock, nowApp } from "./store";
import { executionView } from "./queries";
import {
  RuleError,
  fnApproveStage,
  fnCloseProject,
  fnCloseSubtask,
  fnCreateProject,
  fnDecideEot,
  fnRequestEot,
  fnSettleFinalBill,
  fnSubmitCompletionReport,
  fnSubmitExecutionReport,
  fnSubmitRaBill,
  fnAdvanceRaBill,
} from "./rpc";
import { CHECKLIST_TEMPLATE, progressState, reportCompliance } from "@/lib/execution";
import type { Profile } from "@/lib/domain/types";

const user = (id: string): Profile => getDb().profiles.find((p) => p.id === id)!;
const project = (id: string) => getDb().projects.find((p) => p.id === id)!;

/** The head who owns each stage, so the run can walk the whole ladder. */
const HEAD_FOR_STAGE: Record<string, string> = {
  MINISTRY_PROPOSAL: "u-ministry",
  ADMIN_APPROVAL: "u-fin-head",
  TECH_SANCTION: "u-rb-head",
  TENDER: "u-tnd-head",
  WORK_ORDER: "u-rb-head",
  SITE_EXECUTION: "u-site-head",
  COMPLETION_REPORT: "u-rb-head",
  FINAL_BILL: "u-fin-head",
  DLP_CLOSURE: "u-rb-head",
};

function approveCurrent(projectId: string) {
  const p = project(projectId);
  const db = getDb();
  for (const st of db.subtasks.filter(
    (s) => s.stage_instance_id === p.current_stage_instance_id && s.status === "OPEN",
  )) {
    fnCloseSubtask({ actor: user(HEAD_FOR_STAGE[p.current_stage_key]), subtask_id: st.id });
  }
  fnApproveStage({
    actor: user(HEAD_FOR_STAGE[p.current_stage_key]),
    project_id: projectId,
    remark: "Cleared.",
  });
}

describe("Stage 1 to closure in one run", () => {
  let id: string;

  beforeAll(() => {
    resetDb();
    setClockOffset(0);
    id = fnCreateProject({
      actor: user("u-ministry"),
      title: "Rural road package RP-22, Dholka",
      description: "Upgrading 28 km of village roads under the rural connectivity package.",
      district_id: "dist-ahd",
      sanctioned_cost: 320_000_000,
      sla_overrides: { SITE_EXECUTION: 60, DLP_CLOSURE: 30 },
    }).id;
  });

  it("walks stages 1 to 5 and the Work Order approval creates the checklist", () => {
    approveCurrent(id); // Ministry Proposal -> Admin Approval
    approveCurrent(id); // Admin Approval -> Tech Sanction
    approveCurrent(id); // Tech Sanction -> Tender
    approveCurrent(id); // Tender -> Work Order
    expect(project(id).current_stage_key).toBe("WORK_ORDER");

    approveCurrent(id); // Work Order -> Site Execution
    const view = executionView(id);
    expect(project(id).current_stage_key).toBe("SITE_EXECUTION");
    expect(view.checklist).toHaveLength(CHECKLIST_TEMPLATE.length);
    expect(view.checklist.reduce((a, c) => a + c.weight_pct, 0)).toBe(100);
    expect(project(id).assigned_site_engineer_id).toBe("u-site-eng");
  });

  it("a site report with a photo updates the progress on the passport", () => {
    fnSubmitExecutionReport({
      actor: user("u-site-eng"),
      project_id: id,
      report_type: "WEEKLY",
      progress_pct: 40,
      remarks: "Sub-grade and GSB completed on the first 9 km.",
      issues: "",
      photo_paths: ["/uploads/" + id + "/site-1.jpg"],
    });
    const view = executionView(id);
    expect(view.reports[0].photo_paths).toHaveLength(1);
    expect(view.progress?.actualPct).toBe(40);
    // The checklist absorbed the percentage in weight order.
    expect(view.checklist[0].status).toBe("DONE");
    expect(view.checklist[2].status).toBe("IN_PROGRESS");
  });

  it("only the site team can submit a report", () => {
    expect(() =>
      fnSubmitExecutionReport({
        actor: user("u-fin-op"),
        project_id: id,
        report_type: "WEEKLY",
        progress_pct: 50,
        remarks: "Not my job.",
        issues: "",
      }),
    ).toThrow(RuleError);
  });

  it("running account bills move submitted -> verified -> paid", () => {
    fnSubmitRaBill({ actor: user("u-site-eng"), project_id: id, bill_no: "RA-01", amount: 8_000_000 });
    const bill = executionView(id).bills[0];
    expect(bill.status).toBe("SUBMITTED");
    fnAdvanceRaBill({ actor: user("u-site-head"), bill_id: bill.id });
    expect(executionView(id).bills[0].status).toBe("VERIFIED");
    fnAdvanceRaBill({ actor: user("u-fin-head"), bill_id: bill.id });
    expect(executionView(id).bills[0].status).toBe("PAID");
  });

  it("an approved EoT extends the Site Execution due date and is logged", () => {
    const before = executionView(id).executionInstance!;
    const dueBefore = new Date(before.due_at).getTime();
    const slaBefore = before.sla_days;

    fnRequestEot({
      actor: user("u-site-eng"),
      project_id: id,
      days_requested: 30,
      reason: "Monsoon stoppage of 24 days and delayed shifting of a water main.",
    });
    const eot = executionView(id).eots[0];
    expect(eot.status).toBe("PENDING");

    fnDecideEot({ actor: user("u-site-head"), eot_id: eot.id, approve: true });

    const after = executionView(id).executionInstance!;
    expect(new Date(after.due_at).getTime() - dueBefore).toBe(30 * 86_400_000);
    expect(after.sla_days).toBe(slaBefore + 30);
    expect(
      getDb().file_movements.some(
        (m) => m.project_id === id && m.remark.includes("Extension of time approved"),
      ),
    ).toBe(true);
  });

  it("a site engineer cannot decide their own EoT", () => {
    fnRequestEot({
      actor: user("u-site-eng"),
      project_id: id,
      days_requested: 10,
      reason: "Further delay in the water main shifting work.",
    });
    const pending = executionView(id).eots.find((e) => e.status === "PENDING")!;
    expect(() =>
      fnDecideEot({ actor: user("u-site-eng"), eot_id: pending.id, approve: true }),
    ).toThrow(RuleError);
    fnDecideEot({ actor: user("u-site-head"), eot_id: pending.id, approve: false });
    expect(executionView(id).eots.find((e) => e.id === pending.id)!.status).toBe("REJECTED");
  });

  it("report compliance counts the weeks with no weekly report", () => {
    const inst = executionView(id).executionInstance!;
    shiftClock(21);
    const compliance = reportCompliance(executionView(id).reports, inst.started_at, nowApp());
    expect(compliance.expected).toBe(3);
    expect(compliance.submitted).toBe(1);
    expect(compliance.missed).toBe(2);
    expect(compliance.level).toBe("AMBER");
  });

  it("the completion report auto-fills delay days and reasons", () => {
    // Finish the execution stage late, so there is a real overrun to attribute.
    shiftClock(80);
    approveCurrent(id); // Site Execution -> Completion Report
    expect(project(id).current_stage_key).toBe("COMPLETION_REPORT");

    const { attribution } = executionView(id);
    expect(attribution.delayDays).toBeGreaterThan(0);
    expect(attribution.reasons.join(" ")).toContain("Site Execution");
    expect(attribution.reasons.join(" ")).toContain("Extension of time granted: 30 days");
    expect(attribution.totalBilled).toBe(8_000_000);
    expect(attribution.dues).toBe(0);

    fnSubmitCompletionReport({
      actor: user("u-rb-head"),
      project_id: id,
      work_done_summary: "All 28 km completed and handed over to the division.",
      total_billed: attribution.totalBilled,
      dues: attribution.dues,
      problems_faced: "Monsoon stoppage and a delayed water main shifting.",
      delay_days: attribution.delayDays,
      delay_reasons: attribution.reasons.join(" "),
    });
    expect(executionView(id).completion?.delay_days).toBe(attribution.delayDays);
  });

  it("a second completion report is refused", () => {
    expect(() =>
      fnSubmitCompletionReport({
        actor: user("u-rb-head"),
        project_id: id,
        work_done_summary: "Duplicate report that should not be accepted.",
        total_billed: 1,
        dues: 0,
        problems_faced: "none",
        delay_days: 0,
        delay_reasons: "none",
      }),
    ).toThrow(RuleError);
  });

  it("Finance settles the final bill, and only Finance can", () => {
    approveCurrent(id); // Completion Report -> Final Bill
    expect(project(id).current_stage_key).toBe("FINAL_BILL");
    fnSubmitRaBill({ actor: user("u-site-eng"), project_id: id, bill_no: "FINAL", amount: 2_000_000 });
    expect(executionView(id).attribution.dues).toBe(2_000_000);

    expect(() => fnSettleFinalBill({ actor: user("u-rb-head"), project_id: id })).toThrow(RuleError);
    fnSettleFinalBill({ actor: user("u-fin-head"), project_id: id });
    expect(executionView(id).attribution.dues).toBe(0);
  });

  it("the DLP countdown has to finish before the project can be closed", () => {
    approveCurrent(id); // Final Bill -> DLP & Closure
    expect(project(id).current_stage_key).toBe("DLP_CLOSURE");

    expect(() => fnCloseProject({ actor: user("u-rb-head"), project_id: id })).toThrow(RuleError);

    shiftClock(31); // the 30-day DLP override elapses
    fnCloseProject({ actor: user("u-rb-head"), project_id: id });

    const closed = project(id);
    expect(closed.status).toBe("COMPLETED");
    expect(
      getDb().stage_instances.filter((s) => s.project_id === id).every((s) => s.ended_at !== null),
    ).toBe(true);
  });
});

describe("progress maths", () => {
  it("reports planned, actual and SPI", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const checklist = [
      {
        id: "a",
        project_id: "p",
        title: "A",
        planned_start: "2026-01-01T00:00:00Z",
        planned_end: "2026-01-31T00:00:00Z",
        weight_pct: 50,
        actual_pct: 100,
        status: "DONE" as const,
      },
      {
        id: "b",
        project_id: "p",
        title: "B",
        planned_start: "2026-01-15T00:00:00Z",
        planned_end: "2026-02-15T00:00:00Z",
        weight_pct: 50,
        actual_pct: 0,
        status: "NOT_STARTED" as const,
      },
    ];
    const state = progressState(checklist, now);
    expect(state.actualPct).toBe(50);
    expect(state.plannedPct).toBeGreaterThan(70);
    expect(state.spi).toBeLessThan(1);
  });
});
