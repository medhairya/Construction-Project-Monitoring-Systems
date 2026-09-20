// Pure workflow state machine. No I/O, no framework imports — unit tested in
// src/lib/workflow/workflow.test.ts. Implements rules R1-R5 of the plan.
import { STAGE_DEFINITIONS, STAGE_BY_KEY, stageSeq } from "@/lib/domain/stages";
import type {
  Department,
  Priority,
  Profile,
  Project,
  StageInstance,
  StageKey,
} from "@/lib/domain/types";

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
}

const OK: TransitionCheck = { allowed: true };
const no = (reason: string): TransitionCheck => ({ allowed: false, reason });

/** R1: exactly one active stage; the next stage is the next sequence number. */
export function nextStage(current: StageKey): StageKey | null {
  const seq = stageSeq(current);
  const next = STAGE_DEFINITIONS.find((s) => s.seq === seq + 1);
  return next ? next.key : null;
}

export function previousStages(current: StageKey): StageKey[] {
  const seq = stageSeq(current);
  return STAGE_DEFINITIONS.filter((s) => s.seq < seq).map((s) => s.key);
}

export function ownerDepartmentCode(stage: StageKey): Department["code"] {
  return STAGE_BY_KEY[stage].owner_department_code;
}

export function defaultSlaDays(stage: StageKey): number {
  return STAGE_BY_KEY[stage].default_sla_days;
}

/** True when the user belongs to the department owning the stage. */
export function ownsStage(
  user: Pick<Profile, "role" | "department_id">,
  stage: StageKey,
  departments: Department[],
): boolean {
  const owner = departments.find((d) => d.code === ownerDepartmentCode(stage));
  if (!owner) return false;
  if (user.role === "MINISTRY") return owner.code === "MIN";
  return user.department_id === owner.id;
}

/** R3: only the head of the owning department approves. R7: escalated projects are frozen. */
export function canApprove(
  user: Pick<Profile, "role" | "department_id">,
  project: Pick<Project, "status" | "current_stage_key">,
  departments: Department[],
): TransitionCheck {
  if (project.status === "COMPLETED" || project.status === "CANCELLED") {
    return no("Project is closed.");
  }
  if (project.status === "ESCALATED") {
    return no("Project is escalated — movement is frozen until the Ministry decides.");
  }
  if (user.role === "MINISTRY") {
    return ownsStage(user, project.current_stage_key, departments)
      ? OK
      : no("The Ministry can only approve Ministry-owned stages.");
  }
  if (user.role !== "DEPT_HEAD") return no("Only a department head can approve a stage.");
  if (!ownsStage(user, project.current_stage_key, departments)) {
    return no("Your department does not own this stage.");
  }
  return OK;
}

/** R4: a head may return the file to any earlier stage, with a mandatory reason. */
export function canReturn(
  user: Pick<Profile, "role" | "department_id">,
  project: Pick<Project, "status" | "current_stage_key">,
  target: StageKey,
  departments: Department[],
  reason: string,
): TransitionCheck {
  const base = canApprove(user, project, departments);
  if (!base.allowed) return base;
  if (stageSeq(target) >= stageSeq(project.current_stage_key)) {
    return no("A file can only be returned to an earlier stage.");
  }
  if (!reason || reason.trim().length < 5) {
    return no("A reason is mandatory when returning a file.");
  }
  return OK;
}

/** Heads and operators move the file between desks of their own department. */
export function canForward(
  user: Pick<Profile, "role" | "department_id">,
  project: Pick<Project, "status">,
  toDesk: { department_id: string } | undefined,
): TransitionCheck {
  if (project.status === "ESCALATED") {
    return no("File movement is frozen while the project is escalated.");
  }
  if (project.status === "COMPLETED" || project.status === "CANCELLED") {
    return no("Project is closed.");
  }
  if (user.role !== "DEPT_HEAD" && user.role !== "DEPT_OPERATOR") {
    return no("Only department heads and operators can forward a file.");
  }
  if (!toDesk) return no("Unknown target desk.");
  if (toDesk.department_id !== user.department_id) {
    return no("You can only forward the file inside your own department.");
  }
  return OK;
}

/** R2: a stage advances only when every sub-task is closed. */
export function canAdvanceStage(
  instance: Pick<StageInstance, "status">,
  openSubtasks: number,
): TransitionCheck {
  if (instance.status !== "ACTIVE" && instance.status !== "BREACHED") {
    return no("This stage instance is already closed.");
  }
  if (openSubtasks > 0) return no(openSubtasks + " sub-task(s) still open in this stage.");
  return OK;
}

/** R5: GJ-{DEPT}-{YYYY}-{DISTRICT}-{SEQ4} */
export function buildProjectCode(
  deptCode: string,
  year: number,
  districtCode: string,
  seq: number,
): string {
  return "GJ-" + deptCode + "-" + year + "-" + districtCode + "-" + String(seq).padStart(4, "0");
}

export const PROJECT_CODE_RE = /^GJ-[A-Z]{2,4}-\d{4}-[A-Z]{3}-\d{4}$/;

/** Single entry point used by the server actions and by the UI to disable buttons. */
export function validateTransition(args: {
  kind: "APPROVE" | "RETURN" | "FORWARD";
  user: Pick<Profile, "role" | "department_id">;
  project: Pick<Project, "status" | "current_stage_key">;
  departments: Department[];
  target?: StageKey;
  reason?: string;
  toDesk?: { department_id: string };
  openSubtasks?: number;
  instance?: Pick<StageInstance, "status">;
}): TransitionCheck {
  const { kind, user, project, departments } = args;
  if (kind === "FORWARD") return canForward(user, project, args.toDesk);
  const base =
    kind === "APPROVE"
      ? canApprove(user, project, departments)
      : canReturn(user, project, args.target as StageKey, departments, args.reason ?? "");
  if (!base.allowed) return base;
  if (args.instance) {
    const adv = canAdvanceStage(args.instance, args.openSubtasks ?? 0);
    if (!adv.allowed) return adv;
  }
  return OK;
}

/** R7.6: a project re-entering the flow after a Ministry decision is always HIGH. */
export function priorityAfterDecision(): Priority {
  return "HIGH";
}
