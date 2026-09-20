import { describe, expect, it } from "vitest";
import {
  buildProjectCode,
  canAdvanceStage,
  canApprove,
  canForward,
  canReturn,
  nextStage,
  previousStages,
  PROJECT_CODE_RE,
  validateTransition,
} from "./index";
import { slaState } from "@/lib/sla";
import type { Department, Profile, Project } from "@/lib/domain/types";

const departments: Department[] = [
  { id: "d-min", code: "MIN", name: "Ministry (CMO)" },
  { id: "d-fin", code: "FIN", name: "Finance Department" },
  { id: "d-rb", code: "RB", name: "Roads & Buildings (PWD)" },
  { id: "d-tnd", code: "TND", name: "Tender Cell" },
  { id: "d-site", code: "SITE", name: "Site Execution Wing" },
];

const finHead: Pick<Profile, "role" | "department_id"> = { role: "DEPT_HEAD", department_id: "d-fin" };
const finOp: Pick<Profile, "role" | "department_id"> = { role: "DEPT_OPERATOR", department_id: "d-fin" };
const rbHead: Pick<Profile, "role" | "department_id"> = { role: "DEPT_HEAD", department_id: "d-rb" };
const ministry: Pick<Profile, "role" | "department_id"> = { role: "MINISTRY", department_id: "d-min" };

const atAdminApproval: Pick<Project, "status" | "current_stage_key"> = {
  status: "ACTIVE",
  current_stage_key: "ADMIN_APPROVAL",
};

describe("R1 — one active stage, strictly sequential", () => {
  it("advances one stage at a time", () => {
    expect(nextStage("MINISTRY_PROPOSAL")).toBe("ADMIN_APPROVAL");
    expect(nextStage("ADMIN_APPROVAL")).toBe("TECH_SANCTION");
    expect(nextStage("FINAL_BILL")).toBe("DLP_CLOSURE");
  });

  it("has no stage after the last one", () => {
    expect(nextStage("DLP_CLOSURE")).toBeNull();
  });
});

describe("R2 — a stage advances only when sub-tasks are closed", () => {
  it("blocks while a sub-task is open", () => {
    expect(canAdvanceStage({ status: "ACTIVE" }, 2).allowed).toBe(false);
  });

  it("allows when all sub-tasks are closed", () => {
    expect(canAdvanceStage({ status: "ACTIVE" }, 0).allowed).toBe(true);
  });

  it("refuses to reopen a closed stage instance", () => {
    expect(canAdvanceStage({ status: "APPROVED" }, 0).allowed).toBe(false);
  });
});

describe("R3 — only the head of the owning department approves", () => {
  it("lets the Finance head approve Administrative Approval", () => {
    expect(canApprove(finHead, atAdminApproval, departments).allowed).toBe(true);
  });

  it("stops the R&B head approving a Finance stage", () => {
    expect(canApprove(rbHead, atAdminApproval, departments).allowed).toBe(false);
  });

  it("stops an operator approving their own department stage", () => {
    expect(canApprove(finOp, atAdminApproval, departments).allowed).toBe(false);
  });

  it("lets the Ministry approve only the Ministry stage", () => {
    expect(
      canApprove(ministry, { status: "ACTIVE", current_stage_key: "MINISTRY_PROPOSAL" }, departments)
        .allowed,
    ).toBe(true);
    expect(canApprove(ministry, atAdminApproval, departments).allowed).toBe(false);
  });

  it("freezes approval while the project is escalated (R7.1)", () => {
    expect(
      canApprove(finHead, { ...atAdminApproval, status: "ESCALATED" }, departments).allowed,
    ).toBe(false);
  });
});

describe("R4 — returns go backwards only and need a reason", () => {
  const atTechSanction: Pick<Project, "status" | "current_stage_key"> = {
    status: "ACTIVE",
    current_stage_key: "TECH_SANCTION",
  };

  it("returns to an earlier stage with a reason", () => {
    expect(
      canReturn(rbHead, atTechSanction, "ADMIN_APPROVAL", departments, "Estimate uses old SOR rates")
        .allowed,
    ).toBe(true);
  });

  it("rejects an empty reason", () => {
    expect(canReturn(rbHead, atTechSanction, "ADMIN_APPROVAL", departments, "").allowed).toBe(false);
  });

  it("rejects a forward or same-stage return", () => {
    expect(canReturn(rbHead, atTechSanction, "TENDER", departments, "because").allowed).toBe(false);
    expect(canReturn(rbHead, atTechSanction, "TECH_SANCTION", departments, "because").allowed).toBe(
      false,
    );
  });

  it("lists only earlier stages as return targets", () => {
    expect(previousStages("TECH_SANCTION")).toEqual(["MINISTRY_PROPOSAL", "ADMIN_APPROVAL"]);
    expect(previousStages("MINISTRY_PROPOSAL")).toEqual([]);
  });
});

describe("forwarding stays inside the department", () => {
  it("lets a Finance operator forward to a Finance desk", () => {
    expect(canForward(finOp, { status: "ACTIVE" }, { department_id: "d-fin" }).allowed).toBe(true);
  });

  it("blocks forwarding to another department", () => {
    expect(canForward(finOp, { status: "ACTIVE" }, { department_id: "d-rb" }).allowed).toBe(false);
  });

  it("blocks forwarding while escalated", () => {
    expect(canForward(finOp, { status: "ESCALATED" }, { department_id: "d-fin" }).allowed).toBe(
      false,
    );
  });
});

describe("R5 — project code format", () => {
  it("builds GJ-{DEPT}-{YYYY}-{DISTRICT}-{SEQ4}", () => {
    const code = buildProjectCode("RB", 2026, "AHD", 42);
    expect(code).toBe("GJ-RB-2026-AHD-0042");
    expect(PROJECT_CODE_RE.test(code)).toBe(true);
  });
});

describe("validateTransition composes the rules", () => {
  it("blocks approval when a sub-task is open", () => {
    const res = validateTransition({
      kind: "APPROVE",
      user: finHead,
      project: atAdminApproval,
      departments,
      instance: { status: "ACTIVE" },
      openSubtasks: 1,
    });
    expect(res.allowed).toBe(false);
  });

  it("allows a clean approval", () => {
    const res = validateTransition({
      kind: "APPROVE",
      user: finHead,
      project: atAdminApproval,
      departments,
      instance: { status: "ACTIVE" },
      openSubtasks: 0,
    });
    expect(res.allowed).toBe(true);
  });
});

describe("R6/R7 — SLA state", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  const due = new Date("2026-01-21T00:00:00Z"); // 20 days

  it("is green early in the stage", () => {
    const s = slaState(start, due, new Date("2026-01-05T00:00:00Z"));
    expect(s.level).toBe("GREEN");
    expect(s.breached).toBe(false);
  });

  it("turns amber at 75% of the SLA", () => {
    const s = slaState(start, due, new Date("2026-01-16T00:00:00Z"));
    expect(s.level).toBe("AMBER");
  });

  it("turns red and breaches past the due date", () => {
    const s = slaState(start, due, new Date("2026-01-25T00:00:00Z"));
    expect(s.level).toBe("RED");
    expect(s.breached).toBe(true);
    expect(s.daysRemaining).toBeLessThan(0);
  });
});
