/**
 * End-to-end walk of the demo script (Section 8) against the data layer:
 * create -> forward -> approve -> return -> breach -> justify -> chat ->
 * decide -> re-enter. Also checks the permission rules the plan calls out.
 *
 * Note: this rebuilds the local seed, so run it before a demo, not during one.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, resetDb, setClockOffset, shiftClock, nowApp } from "./store";
import {
  RuleError,
  fnApproveStage,
  fnCloseSubtask,
  fnCreateProject,
  fnForwardFile,
  fnPostChatMessage,
  fnRecordDecision,
  fnReturnStage,
  fnSlaSweep,
  fnSubmitJustification,
} from "./rpc";
import { movementsFor } from "./queries";
import { PROJECT_CODE_RE } from "@/lib/workflow";
import type { Profile } from "@/lib/domain/types";

const user = (id: string): Profile => getDb().profiles.find((p) => p.id === id)!;

beforeAll(() => {
  resetDb();
  setClockOffset(0);
});

describe("seed data matches Phase 1 step 6", () => {
  it("has the departments, desks, districts and demo users", () => {
    const db = getDb();
    expect(db.departments).toHaveLength(5);
    expect(db.desks.length).toBeGreaterThanOrEqual(12);
    expect(db.districts).toHaveLength(3);
    expect(db.profiles.map((p) => p.email)).toContain("finance.op@demo");
    expect(db.projects).toHaveLength(15);
  });

  it("spreads projects across the required situations", () => {
    const db = getDb();
    fnSlaSweep();
    expect(db.projects.filter((p) => p.status === "ESCALATED").length).toBeGreaterThanOrEqual(2);
    expect(db.projects.filter((p) => p.priority === "HIGH").length).toBeGreaterThanOrEqual(1);
    expect(db.projects.filter((p) => p.status === "COMPLETED").length).toBeGreaterThanOrEqual(1);
    // At least two projects carry a return loop (a stage visited twice).
    const looped = db.projects.filter((p) => {
      const visits = db.stage_instances.filter((s) => s.project_id === p.id);
      return visits.some((v) => v.attempt_no > 1);
    });
    expect(looped.length).toBeGreaterThanOrEqual(2);
    // Two projects in site execution have reports.
    const withReports = new Set(db.execution_reports.map((r) => r.project_id));
    expect(withReports.size).toBeGreaterThanOrEqual(2);
  });
});

describe("demo script, start to finish", () => {
  let projectId: string;
  let projectCode: string;

  it("1. Ministry creates a proposal and a Project ID is generated (R5)", () => {
    const project = fnCreateProject({
      actor: user("u-ministry"),
      title: "Four-lane road, Sanand–Bavla (test run)",
      description: "Widening to four lanes with two minor bridges.",
      district_id: "dist-ahd",
      sanctioned_cost: 1_840_000_000,
      sla_overrides: {},
    });
    projectId = project.id;
    projectCode = project.project_code;
    expect(PROJECT_CODE_RE.test(projectCode)).toBe(true);
    expect(project.current_stage_key).toBe("MINISTRY_PROPOSAL");
  });

  it("2. the Ministry approves stage 1, so the file reaches Finance", () => {
    fnApproveStage({ actor: user("u-ministry"), project_id: projectId, remark: "Proposal cleared." });
    const project = getDb().projects.find((p) => p.id === projectId)!;
    expect(project.current_stage_key).toBe("ADMIN_APPROVAL");
  });

  it("3. a Finance operator forwards the file between two Finance desks", () => {
    fnForwardFile({
      actor: user("u-fin-op"),
      project_id: projectId,
      to_desk_id: "dk-fin-ao",
      remark: "Forwarded to the Accounts Officer.",
    });
    const inst = getDb().stage_instances.find(
      (s) => s.id === getDb().projects.find((p) => p.id === projectId)!.current_stage_instance_id,
    )!;
    expect(inst.holder_desk_id).toBe("dk-fin-ao");
  });

  it("   R&B sees only a summary line for the Finance desk movements", () => {
    const asRb = movementsFor(projectId, user("u-rb-op"));
    const financeMoves = asRb.filter((m) => m.departmentId === "d-fin");
    expect(financeMoves.length).toBeGreaterThan(0);
    expect(financeMoves.every((m) => m.visible === false)).toBe(true);
    // ...while Finance sees the detail.
    const asFin = movementsFor(projectId, user("u-fin-op"));
    expect(asFin.some((m) => m.departmentId === "d-fin" && m.visible)).toBe(true);
  });

  it("   a Finance operator cannot forward the file to an R&B desk", () => {
    expect(() =>
      fnForwardFile({
        actor: user("u-fin-op"),
        project_id: projectId,
        to_desk_id: "dk-rb-ee",
        remark: "Nope.",
      }),
    ).toThrow(RuleError);
  });

  it("   nobody can approve a stage their department does not own (R3)", () => {
    expect(() =>
      fnApproveStage({ actor: user("u-rb-head"), project_id: projectId, remark: "" }),
    ).toThrow(RuleError);
    expect(() =>
      fnApproveStage({ actor: user("u-fin-op"), project_id: projectId, remark: "" }),
    ).toThrow(RuleError);
  });

  it("4. the Finance head approves and the project moves to Technical Sanction", () => {
    fnApproveStage({
      actor: user("u-fin-head"),
      project_id: projectId,
      remark: "Administrative approval accorded.",
    });
    expect(getDb().projects.find((p) => p.id === projectId)!.current_stage_key).toBe(
      "TECH_SANCTION",
    );
  });

  it("5. the R&B head returns it to Admin Approval — new instance, SLA restarts (R4)", () => {
    fnReturnStage({
      actor: user("u-rb-head"),
      project_id: projectId,
      target_stage: "ADMIN_APPROVAL",
      reason: "Estimate uses old SOR rates.",
    });
    const db = getDb();
    const project = db.projects.find((p) => p.id === projectId)!;
    expect(project.current_stage_key).toBe("ADMIN_APPROVAL");
    const visits = db.stage_instances.filter(
      (s) => s.project_id === projectId && s.stage_key === "ADMIN_APPROVAL",
    );
    expect(visits).toHaveLength(2);
    expect(visits[1].attempt_no).toBe(2);
    expect(visits[1].entered_via).toBe("RETURN");
    // The clock restarted: the new instance is due in a full SLA from now.
    const remaining =
      (new Date(visits[1].due_at).getTime() - nowApp().getTime()) / 86_400_000;
    expect(remaining).toBeGreaterThan(20);
  });

  it("   a return cannot go forwards", () => {
    expect(() =>
      fnReturnStage({
        actor: user("u-fin-head"),
        project_id: projectId,
        target_stage: "TENDER",
        reason: "Not allowed.",
      }),
    ).toThrow(RuleError);
  });

  let escalationId: string;

  it("6. moving the demo clock forward breaches the SLA and opens an escalation (R7.1)", () => {
    shiftClock(40);
    fnSlaSweep();
    const db = getDb();
    const project = db.projects.find((p) => p.id === projectId)!;
    expect(project.status).toBe("ESCALATED");
    const esc = db.escalations.find(
      (e) => e.project_id === projectId && e.status !== "DECIDED",
    )!;
    expect(esc.status).toBe("AWAITING_JUSTIFICATION");
    escalationId = esc.id;
  });

  it("   forward movement is frozen while escalated", () => {
    expect(() =>
      fnForwardFile({
        actor: user("u-fin-op"),
        project_id: projectId,
        to_desk_id: "dk-fin-ds",
        remark: "Should be blocked.",
      }),
    ).toThrow(RuleError);
    expect(() =>
      fnApproveStage({ actor: user("u-fin-head"), project_id: projectId, remark: "" }),
    ).toThrow(RuleError);
  });

  it("7. the holding officer submits a justification, the Ministry sees it", () => {
    fnSubmitJustification({
      actor: user("u-fin-head"),
      escalation_id: escalationId,
      cause: "DOCUMENTS_PENDING",
      explanation: "The revised estimate on SOR 2025 was not received from the division.",
      impact: "Tender award slips past the financial year.",
      proposed_fix: "Division has been directed to submit within a week.",
      new_eta: "2026-12-31",
    });
    const db = getDb();
    expect(db.escalations.find((e) => e.id === escalationId)!.status).toBe("UNDER_REVIEW");
    expect(db.justifications.some((j) => j.escalation_id === escalationId)).toBe(true);
  });

  it("8. the Ministry and the officer chat on the permanent record", () => {
    fnPostChatMessage({
      actor: user("u-ministry"),
      escalation_id: escalationId,
      body: "State the exact date the revised estimate will be on file.",
    });
    fnPostChatMessage({
      actor: user("u-fin-head"),
      escalation_id: escalationId,
      body: "By Friday. A dedicated officer is following up daily.",
    });
    const db = getDb();
    const thread = db.chat_threads.find((t) => t.escalation_id === escalationId)!;
    expect(db.chat_messages.filter((m) => m.thread_id === thread.id)).toHaveLength(2);
  });

  it("   only the Ministry can record the decision", () => {
    expect(() =>
      fnRecordDecision({
        actor: user("u-fin-head"),
        escalation_id: escalationId,
        decision_type: "ORDER_CHANGES",
        changes_ordered: "x",
        reason: "y",
        new_sla_days: 10,
        reentry_stage_key: "ADMIN_APPROVAL",
        priority: "HIGH",
      }),
    ).toThrow(RuleError);
  });

  it("9. the Ministry decides — the file re-enters with HIGH priority and a new SLA (R7.6)", () => {
    fnRecordDecision({
      actor: user("u-ministry"),
      escalation_id: escalationId,
      decision_type: "ORDER_CHANGES",
      changes_ordered: "Revise the estimate on SOR 2025 and place it before the Secretary.",
      reason: "The delay was caused by a pending document that is now available.",
      new_sla_days: 10,
      reentry_stage_key: "ADMIN_APPROVAL",
      priority: "HIGH",
    });
    const db = getDb();
    const project = db.projects.find((p) => p.id === projectId)!;
    expect(project.status).toBe("ACTIVE");
    expect(project.priority).toBe("HIGH");
    expect(project.current_stage_key).toBe("ADMIN_APPROVAL");
    const inst = db.stage_instances.find((s) => s.id === project.current_stage_instance_id)!;
    expect(inst.entered_via).toBe("REENTRY");
    expect(inst.sla_days).toBe(10);
    expect(db.escalations.find((e) => e.id === escalationId)!.status).toBe("DECIDED");
  });

  it("   a second decision on the same escalation is refused (append-only)", () => {
    expect(() =>
      fnRecordDecision({
        actor: user("u-ministry"),
        escalation_id: escalationId,
        decision_type: "ORDER_CHANGES",
        changes_ordered: "again",
        reason: "again",
        new_sla_days: 5,
        reentry_stage_key: "ADMIN_APPROVAL",
        priority: "HIGH",
      }),
    ).toThrow(RuleError);
  });

  it("10. the file moves again after re-entry, and every step is on the audit trail", () => {
    fnForwardFile({
      actor: user("u-fin-op"),
      project_id: projectId,
      to_desk_id: "dk-fin-ds",
      remark: "Revised estimate placed before the Deputy Secretary.",
    });
    const actions = getDb()
      .file_movements.filter((m) => m.project_id === projectId)
      .map((m) => m.action);
    expect(actions).toContain("RECEIVED");
    expect(actions).toContain("FORWARDED");
    expect(actions).toContain("APPROVED");
    expect(actions).toContain("RETURNED");
    expect(actions).toContain("ESCALATED");
    expect(actions).toContain("REENTERED");
  });
});

describe("R2 — a stage cannot advance while a sub-task is open", () => {
  it("blocks approval until the sub-task is closed", () => {
    resetDb();
    setClockOffset(0);
    const db = getDb();
    // Seeded project 1 sits at Admin Approval with an open Planning sub-task.
    const project = db.projects.find(
      (p) => p.current_stage_key === "ADMIN_APPROVAL" && p.status === "ACTIVE",
    )!;
    const open = db.subtasks.filter(
      (s) => s.stage_instance_id === project.current_stage_instance_id && s.status === "OPEN",
    );
    expect(open.length).toBeGreaterThan(0);
    expect(() =>
      fnApproveStage({ actor: user("u-fin-head"), project_id: project.id, remark: "" }),
    ).toThrow(RuleError);

    for (const st of open) fnCloseSubtask({ actor: user("u-fin-head"), subtask_id: st.id });
    fnApproveStage({ actor: user("u-fin-head"), project_id: project.id, remark: "Approved." });
    expect(getDb().projects.find((p) => p.id === project.id)!.current_stage_key).toBe(
      "TECH_SANCTION",
    );
  });
});
