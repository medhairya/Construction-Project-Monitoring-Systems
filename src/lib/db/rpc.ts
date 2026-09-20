import "server-only";
import { STAGE_BY_KEY } from "@/lib/domain/stages";
import { addDays } from "@/lib/sla";
import { buildChecklist } from "@/lib/execution";
import {
  buildProjectCode,
  nextStage,
  validateTransition,
} from "@/lib/workflow";
import type {
  BreachCause,
  DecisionType,
  Database,
  FileMovement,
  MovementAction,
  Priority,
  Profile,
  Project,
  StageInstance,
  StageKey,
} from "@/lib/domain/types";
import { getDb, newId, nextSeq, nowApp, writeDb } from "./store";

export class RuleError extends Error {}

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new RuleError(message);
  return value;
}

function logMovement(
  db: Database,
  args: {
    project_id: string;
    stage_instance_id: string;
    action: MovementAction;
    from_desk_id?: string | null;
    to_desk_id?: string | null;
    actor_id: string;
    remark: string;
  },
) {
  db.file_movements.push({
    id: newId("mv"),
    project_id: args.project_id,
    stage_instance_id: args.stage_instance_id,
    action: args.action,
    from_desk_id: args.from_desk_id ?? null,
    to_desk_id: args.to_desk_id ?? null,
    actor_id: args.actor_id,
    remark: args.remark,
    created_at: nowApp().toISOString(),
  } satisfies FileMovement);
}

function openInstance(
  db: Database,
  project: Project,
  stage: StageKey,
  opts: { slaDays: number; entered_via: StageInstance["entered_via"]; actor: string; remark: string },
): StageInstance {
  const attempts = db.stage_instances.filter(
    (s) => s.project_id === project.id && s.stage_key === stage,
  ).length;
  const now = nowApp();
  const ownerCode = STAGE_BY_KEY[stage].owner_department_code;
  const ownerDept = db.departments.find((d) => d.code === ownerCode);
  const entryDesk = db.desks.find((d) => d.department_id === ownerDept?.id) ?? null;
  const instance: StageInstance = {
    id: newId("si"),
    project_id: project.id,
    stage_key: stage,
    attempt_no: attempts + 1,
    status: "ACTIVE",
    started_at: now.toISOString(),
    due_at: addDays(now, opts.slaDays).toISOString(),
    ended_at: null,
    sla_days: opts.slaDays,
    entered_via: opts.entered_via,
    holder_desk_id: entryDesk?.id ?? null,
  };
  db.stage_instances.push(instance);
  project.current_stage_key = stage;
  project.current_stage_instance_id = instance.id;

  // Phase 4 task 1: entering Site Execution creates the checklist from the
  // template, spread across the stage SLA.
  if (stage === "SITE_EXECUTION" && !db.execution_checklist_items.some((c) => c.project_id === project.id)) {
    db.execution_checklist_items.push(
      ...buildChecklist(project.id, instance.started_at, instance.sla_days, () => newId("ci")),
    );
    if (!project.assigned_site_engineer_id) {
      project.assigned_site_engineer_id =
        db.profiles.find((p) => p.role === "SITE_ENGINEER")?.id ?? null;
    }
  }
  logMovement(db, {
    project_id: project.id,
    stage_instance_id: instance.id,
    action: opts.entered_via === "REENTRY" ? "REENTERED" : "RECEIVED",
    to_desk_id: instance.holder_desk_id,
    actor_id: opts.actor,
    remark: opts.remark,
  });
  return instance;
}

function slaDaysFor(db: Database, projectId: string, stage: StageKey): number {
  const override = db.project_sla_overrides.find(
    (o) => o.project_id === projectId && o.stage_key === stage,
  );
  return override?.sla_days ?? STAGE_BY_KEY[stage].default_sla_days;
}

/** fn_create_project — R5: the Project ID is generated only here, at Stage 1. */
export function fnCreateProject(args: {
  actor: Profile;
  title: string;
  description: string;
  district_id: string;
  sanctioned_cost: number;
  sla_overrides: Partial<Record<StageKey, number>>;
}): Project {
  if (args.actor.role !== "MINISTRY" && args.actor.role !== "SUPER_ADMIN") {
    throw new RuleError("Only the Ministry can create a project proposal.");
  }
  const now = nowApp();
  const year = now.getFullYear();
  const seq = nextSeq(String(year));
  return writeDb((db) => {
    const district = must(
      db.districts.find((d) => d.id === args.district_id),
      "Unknown district.",
    );
    const project: Project = {
      id: newId("p"),
      project_code: buildProjectCode("RB", year, district.code, seq),
      title: args.title,
      description: args.description,
      district_id: district.id,
      sanctioned_cost: args.sanctioned_cost,
      status: "ACTIVE",
      priority: "NORMAL",
      current_stage_key: "MINISTRY_PROPOSAL",
      current_stage_instance_id: null,
      created_by: args.actor.id,
      created_at: now.toISOString(),
      assigned_site_engineer_id: null,
    };
    db.projects.push(project);
    for (const [stage_key, sla_days] of Object.entries(args.sla_overrides)) {
      if (typeof sla_days === "number" && sla_days > 0) {
        db.project_sla_overrides.push({
          project_id: project.id,
          stage_key: stage_key as StageKey,
          sla_days,
        });
      }
    }
    openInstance(db, project, "MINISTRY_PROPOSAL", {
      slaDays: slaDaysFor(db, project.id, "MINISTRY_PROPOSAL"),
      entered_via: "FORWARD",
      actor: args.actor.id,
      remark: "Proposal created. Project ID " + project.project_code + " generated.",
    });
    return project;
  });
}

function closeCurrent(
  db: Database,
  project: Project,
  status: "APPROVED" | "RETURNED",
): StageInstance {
  const inst = must(
    db.stage_instances.find((s) => s.id === project.current_stage_instance_id),
    "No active stage instance.",
  );
  inst.status = status;
  inst.ended_at = nowApp().toISOString();
  return inst;
}

function openSubtaskCount(db: Database, instanceId: string): number {
  return db.subtasks.filter((s) => s.stage_instance_id === instanceId && s.status === "OPEN").length;
}

/** fn_approve_stage — R1, R2, R3. */
export function fnApproveStage(args: { actor: Profile; project_id: string; remark: string }) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    const inst = must(
      db.stage_instances.find((s) => s.id === project.current_stage_instance_id),
      "No active stage instance.",
    );
    const check = validateTransition({
      kind: "APPROVE",
      user: args.actor,
      project,
      departments: db.departments,
      instance: inst,
      openSubtasks: openSubtaskCount(db, inst.id),
    });
    if (!check.allowed) throw new RuleError(check.reason ?? "Not allowed.");

    closeCurrent(db, project, "APPROVED");
    logMovement(db, {
      project_id: project.id,
      stage_instance_id: inst.id,
      action: "APPROVED",
      from_desk_id: inst.holder_desk_id,
      actor_id: args.actor.id,
      remark: args.remark || "Approved at " + STAGE_BY_KEY[inst.stage_key].name + ".",
    });

    const next = nextStage(inst.stage_key);
    if (!next) {
      project.status = "COMPLETED";
      project.current_stage_instance_id = inst.id;
      return { completed: true as const, project };
    }
    openInstance(db, project, next, {
      slaDays: slaDaysFor(db, project.id, next),
      entered_via: "FORWARD",
      actor: args.actor.id,
      remark: "File received at " + STAGE_BY_KEY[next].name + ".",
    });
    return { completed: false as const, project };
  });
}

/** fn_return_stage — R4. */
export function fnReturnStage(args: {
  actor: Profile;
  project_id: string;
  target_stage: StageKey;
  reason: string;
}) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    const inst = must(
      db.stage_instances.find((s) => s.id === project.current_stage_instance_id),
      "No active stage instance.",
    );
    const check = validateTransition({
      kind: "RETURN",
      user: args.actor,
      project,
      departments: db.departments,
      target: args.target_stage,
      reason: args.reason,
      instance: inst,
      openSubtasks: openSubtaskCount(db, inst.id),
    });
    if (!check.allowed) throw new RuleError(check.reason ?? "Not allowed.");

    closeCurrent(db, project, "RETURNED");
    logMovement(db, {
      project_id: project.id,
      stage_instance_id: inst.id,
      action: "RETURNED",
      from_desk_id: inst.holder_desk_id,
      actor_id: args.actor.id,
      remark: args.reason,
    });
    openInstance(db, project, args.target_stage, {
      slaDays: slaDaysFor(db, project.id, args.target_stage),
      entered_via: "RETURN",
      actor: args.actor.id,
      remark: "Returned from " + STAGE_BY_KEY[inst.stage_key].name + ": " + args.reason,
    });
    return project;
  });
}

/** fn_forward_file — desk to desk inside the actor's own department. */
export function fnForwardFile(args: {
  actor: Profile;
  project_id: string;
  to_desk_id: string;
  remark: string;
}) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    const inst = must(
      db.stage_instances.find((s) => s.id === project.current_stage_instance_id),
      "No active stage instance.",
    );
    const toDesk = must(db.desks.find((d) => d.id === args.to_desk_id), "Unknown desk.");
    const check = validateTransition({
      kind: "FORWARD",
      user: args.actor,
      project,
      departments: db.departments,
      toDesk,
    });
    if (!check.allowed) throw new RuleError(check.reason ?? "Not allowed.");
    const ownerCode = STAGE_BY_KEY[inst.stage_key].owner_department_code;
    const ownerDept = db.departments.find((d) => d.code === ownerCode);
    if (toDesk.department_id !== ownerDept?.id) {
      throw new RuleError("The file is not with your department at this stage.");
    }
    const from = inst.holder_desk_id;
    inst.holder_desk_id = toDesk.id;
    logMovement(db, {
      project_id: project.id,
      stage_instance_id: inst.id,
      action: "FORWARDED",
      from_desk_id: from,
      to_desk_id: toDesk.id,
      actor_id: args.actor.id,
      remark: args.remark || "Forwarded to " + toDesk.designation + ".",
    });
    return project;
  });
}

export function fnOpenSubtask(args: {
  actor: Profile;
  project_id: string;
  desk_id: string;
  title: string;
}) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    const inst = must(
      db.stage_instances.find((s) => s.id === project.current_stage_instance_id),
      "No active stage instance.",
    );
    const desk = must(db.desks.find((d) => d.id === args.desk_id), "Unknown desk.");
    db.subtasks.push({
      id: newId("st"),
      stage_instance_id: inst.id,
      department_id: desk.department_id,
      desk_id: desk.id,
      title: args.title,
      status: "OPEN",
      opened_at: nowApp().toISOString(),
      closed_at: null,
    });
    logMovement(db, {
      project_id: project.id,
      stage_instance_id: inst.id,
      action: "SUBTASK_OPENED",
      from_desk_id: inst.holder_desk_id,
      to_desk_id: desk.id,
      actor_id: args.actor.id,
      remark: "Sub-task opened: " + args.title,
    });
  });
}

export function fnCloseSubtask(args: { actor: Profile; subtask_id: string }) {
  return writeDb((db) => {
    const st = must(db.subtasks.find((s) => s.id === args.subtask_id), "Unknown sub-task.");
    st.status = "CLOSED";
    st.closed_at = nowApp().toISOString();
    const inst = must(
      db.stage_instances.find((s) => s.id === st.stage_instance_id),
      "Unknown stage instance.",
    );
    logMovement(db, {
      project_id: inst.project_id,
      stage_instance_id: inst.id,
      action: "SUBTASK_CLOSED",
      from_desk_id: st.desk_id,
      to_desk_id: inst.holder_desk_id,
      actor_id: args.actor.id,
      remark: "Sub-task closed: " + st.title,
    });
  });
}

/** fn_sla_sweep — R7.1. Marks breaches and opens escalations. Idempotent. */
export function fnSlaSweep(): { breached: number } {
  return writeDb((db) => {
    const now = nowApp();
    let breached = 0;
    for (const inst of db.stage_instances) {
      if (inst.status !== "ACTIVE") continue;
      if (new Date(inst.due_at).getTime() >= now.getTime()) continue;
      const project = db.projects.find((p) => p.id === inst.project_id);
      if (!project || project.status === "COMPLETED" || project.status === "CANCELLED") continue;
      inst.status = "BREACHED";
      project.status = "ESCALATED";
      const exists = db.escalations.find((e) => e.stage_instance_id === inst.id);
      if (!exists) {
        db.escalations.push({
          id: newId("esc"),
          project_id: project.id,
          stage_instance_id: inst.id,
          breached_at: inst.due_at,
          status: "AWAITING_JUSTIFICATION",
        });
        logMovement(db, {
          project_id: project.id,
          stage_instance_id: inst.id,
          action: "ESCALATED",
          from_desk_id: inst.holder_desk_id,
          actor_id: "u-admin",
          remark: "SLA breached — escalated to the Ministry. Forward movement frozen.",
        });
      }
      breached += 1;
    }
    return { breached };
  });
}

export function fnSubmitJustification(args: {
  actor: Profile;
  escalation_id: string;
  cause: BreachCause;
  explanation: string;
  impact: string;
  proposed_fix: string;
  new_eta: string;
}) {
  return writeDb((db) => {
    const esc = must(
      db.escalations.find((e) => e.id === args.escalation_id),
      "Unknown escalation.",
    );
    if (esc.status === "DECIDED") throw new RuleError("This escalation has already been decided.");
    db.justifications.push({
      id: newId("just"),
      escalation_id: esc.id,
      submitted_by: args.actor.id,
      cause: args.cause,
      explanation: args.explanation,
      impact: args.impact,
      proposed_fix: args.proposed_fix,
      new_eta: args.new_eta,
      created_at: nowApp().toISOString(),
    });
    esc.status = "UNDER_REVIEW";
    if (!db.chat_threads.some((t) => t.escalation_id === esc.id)) {
      db.chat_threads.push({
        id: newId("th"),
        escalation_id: esc.id,
        created_by: args.actor.id,
        created_at: nowApp().toISOString(),
      });
    }
  });
}

/** Append-only: there is no update or delete path for chat messages. */
export function fnPostChatMessage(args: { actor: Profile; escalation_id: string; body: string }) {
  return writeDb((db) => {
    const esc = must(
      db.escalations.find((e) => e.id === args.escalation_id),
      "Unknown escalation.",
    );
    let thread = db.chat_threads.find((t) => t.escalation_id === esc.id);
    if (!thread) {
      thread = {
        id: newId("th"),
        escalation_id: esc.id,
        created_by: args.actor.id,
        created_at: nowApp().toISOString(),
      };
      db.chat_threads.push(thread);
    }
    db.chat_messages.push({
      id: newId("cm"),
      thread_id: thread.id,
      sender_id: args.actor.id,
      body: args.body,
      created_at: nowApp().toISOString(),
    });
  });
}

/** fn_record_decision — R7.5 and R7.6: re-entry, HIGH priority, new SLA. */
export function fnRecordDecision(args: {
  actor: Profile;
  escalation_id: string;
  decision_type: DecisionType;
  changes_ordered: string;
  reason: string;
  new_sla_days: number;
  reentry_stage_key: StageKey;
  priority: Priority;
}) {
  if (args.actor.role !== "MINISTRY") {
    throw new RuleError("Only the Ministry can record an escalation decision.");
  }
  return writeDb((db) => {
    const esc = must(
      db.escalations.find((e) => e.id === args.escalation_id),
      "Unknown escalation.",
    );
    if (esc.status === "DECIDED") throw new RuleError("A decision is already on record.");
    const project = must(db.projects.find((p) => p.id === esc.project_id), "Unknown project.");
    const inst = must(
      db.stage_instances.find((s) => s.id === esc.stage_instance_id),
      "Unknown stage instance.",
    );

    db.decisions.push({
      id: newId("dec"),
      escalation_id: esc.id,
      decided_by: args.actor.id,
      decision_type: args.decision_type,
      changes_ordered: args.changes_ordered,
      reason: args.reason,
      new_sla_days: args.new_sla_days,
      reentry_stage_key: args.reentry_stage_key,
      priority: args.priority,
      created_at: nowApp().toISOString(),
    });
    esc.status = "DECIDED";

    if (args.decision_type === "CANCEL_PROJECT") {
      project.status = "CANCELLED";
      inst.status = "APPROVED";
      inst.ended_at = nowApp().toISOString();
      logMovement(db, {
        project_id: project.id,
        stage_instance_id: inst.id,
        action: "NOTE",
        actor_id: args.actor.id,
        remark: "Project cancelled by Ministry decision: " + args.reason,
      });
      return project;
    }

    // Close the breached instance and re-enter at the chosen stage (R7.6).
    inst.status = "RETURNED";
    inst.ended_at = nowApp().toISOString();
    project.status = "ACTIVE";
    project.priority = args.priority;
    openInstance(db, project, args.reentry_stage_key, {
      slaDays: args.new_sla_days,
      entered_via: "REENTRY",
      actor: args.actor.id,
      remark:
        "Re-entered after the Ministry decision, priority " +
        args.priority +
        ", SLA " +
        args.new_sla_days +
        " days. " +
        args.changes_ordered,
    });
    return project;
  });
}

export function fnSubmitExecutionReport(args: {
  actor: Profile;
  project_id: string;
  report_type: "DAILY" | "WEEKLY" | "MONTHLY";
  progress_pct: number;
  remarks: string;
  issues: string;
  photo_paths?: string[];
}) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    if (args.actor.role !== "SITE_ENGINEER" && args.actor.role !== "DEPT_HEAD") {
      throw new RuleError("Only the site team can submit an execution report.");
    }
    db.execution_reports.push({
      id: newId("er"),
      project_id: project.id,
      report_type: args.report_type,
      submitted_by: args.actor.id,
      progress_pct: args.progress_pct,
      remarks: args.remarks,
      issues: args.issues,
      photo_paths: args.photo_paths ?? [],
      created_at: nowApp().toISOString(),
    });

    // The reported percentage drives the checklist, so the Passport progress
    // bar and the SPI move with the site reports.
    applyProgress(db, project.id, args.progress_pct);

    const inst = db.stage_instances.find((s) => s.id === project.current_stage_instance_id);
    if (inst) {
      logMovement(db, {
        project_id: project.id,
        stage_instance_id: inst.id,
        action: "NOTE",
        from_desk_id: args.actor.desk_id,
        actor_id: args.actor.id,
        remark:
          args.report_type.toLowerCase() +
          " report: " +
          args.progress_pct +
          "% complete. " +
          args.remarks,
      });
    }
  });
}

/** Distributes an overall progress percentage across the weighted checklist. */
function applyProgress(db: Database, projectId: string, overallPct: number) {
  const items = db.execution_checklist_items.filter((c) => c.project_id === projectId);
  let remaining = overallPct;
  for (const item of items) {
    const share = Math.min(item.weight_pct, Math.max(0, remaining));
    item.actual_pct = Math.round((share / item.weight_pct) * 100);
    item.status = item.actual_pct >= 100 ? "DONE" : item.actual_pct > 0 ? "IN_PROGRESS" : "NOT_STARTED";
    remaining -= share;
  }
}

// --- Phase 4: RA bills, EoT, completion, final bill, closure --------------

export function fnSubmitRaBill(args: {
  actor: Profile;
  project_id: string;
  bill_no: string;
  amount: number;
}) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    if (db.ra_bills.some((b) => b.project_id === project.id && b.bill_no === args.bill_no)) {
      throw new RuleError("A bill with this number already exists for this project.");
    }
    db.ra_bills.push({
      id: newId("bill"),
      project_id: project.id,
      bill_no: args.bill_no,
      amount: args.amount,
      submitted_by: args.actor.id,
      submitted_at: nowApp().toISOString(),
      status: "SUBMITTED",
      paid_at: null,
    });
  });
}

export function fnAdvanceRaBill(args: { actor: Profile; bill_id: string }) {
  return writeDb((db) => {
    const bill = must(db.ra_bills.find((b) => b.id === args.bill_id), "Unknown bill.");
    if (bill.status === "SUBMITTED") {
      if (args.actor.role !== "DEPT_HEAD" && args.actor.role !== "MINISTRY") {
        throw new RuleError("Only a department head can verify a running account bill.");
      }
      bill.status = "VERIFIED";
    } else if (bill.status === "VERIFIED") {
      const finance = db.departments.find((d) => d.code === "FIN");
      if (args.actor.department_id !== finance?.id && args.actor.role !== "SUPER_ADMIN") {
        throw new RuleError("Only Finance can mark a bill paid.");
      }
      bill.status = "PAID";
      bill.paid_at = nowApp().toISOString();
    } else {
      throw new RuleError("This bill is already paid.");
    }
  });
}

export function fnRequestEot(args: {
  actor: Profile;
  project_id: string;
  days_requested: number;
  reason: string;
}) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    db.eot_requests.push({
      id: newId("eot"),
      project_id: project.id,
      days_requested: args.days_requested,
      reason: args.reason,
      status: "PENDING",
      requested_by: args.actor.id,
      decided_by: null,
      created_at: nowApp().toISOString(),
      decided_at: null,
    });
  });
}

/** An approved EoT extends the live Site Execution due date and is logged. */
export function fnDecideEot(args: { actor: Profile; eot_id: string; approve: boolean }) {
  return writeDb((db) => {
    const eot = must(db.eot_requests.find((e) => e.id === args.eot_id), "Unknown EoT request.");
    if (eot.status !== "PENDING") throw new RuleError("This request has already been decided.");
    if (args.actor.role !== "DEPT_HEAD" && args.actor.role !== "MINISTRY") {
      throw new RuleError("Only the Executive Engineer (department head) can decide an EoT.");
    }
    eot.status = args.approve ? "APPROVED" : "REJECTED";
    eot.decided_by = args.actor.id;
    eot.decided_at = nowApp().toISOString();
    if (!args.approve) return;

    const project = must(db.projects.find((p) => p.id === eot.project_id), "Unknown project.");
    const inst = db.stage_instances.find((s) => s.id === project.current_stage_instance_id);
    if (!inst || inst.stage_key !== "SITE_EXECUTION") {
      throw new RuleError("An extension of time applies only while the project is in Site Execution.");
    }
    inst.due_at = addDays(new Date(inst.due_at), eot.days_requested).toISOString();
    inst.sla_days += eot.days_requested;
    if (inst.status === "BREACHED" && new Date(inst.due_at).getTime() > nowApp().getTime()) {
      inst.status = "ACTIVE";
    }
    logMovement(db, {
      project_id: project.id,
      stage_instance_id: inst.id,
      action: "NOTE",
      actor_id: args.actor.id,
      remark:
        "Extension of time approved: " +
        eot.days_requested +
        " days. New due date " +
        new Date(inst.due_at).toDateString() +
        ". Reason: " +
        eot.reason,
    });
  });
}

export function fnSubmitCompletionReport(args: {
  actor: Profile;
  project_id: string;
  work_done_summary: string;
  total_billed: number;
  dues: number;
  problems_faced: string;
  delay_days: number;
  delay_reasons: string;
}) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    if (db.completion_reports.some((c) => c.project_id === project.id)) {
      throw new RuleError("A completion report is already on record for this project.");
    }
    db.completion_reports.push({
      id: newId("cr"),
      project_id: project.id,
      work_done_summary: args.work_done_summary,
      total_billed: args.total_billed,
      dues: args.dues,
      problems_faced: args.problems_faced,
      delay_days: args.delay_days,
      delay_reasons: args.delay_reasons,
      signed_by: args.actor.id,
      ai_drafted: false,
      created_at: nowApp().toISOString(),
    });
    const inst = db.stage_instances.find((s) => s.id === project.current_stage_instance_id);
    if (inst) {
      logMovement(db, {
        project_id: project.id,
        stage_instance_id: inst.id,
        action: "NOTE",
        from_desk_id: args.actor.desk_id,
        actor_id: args.actor.id,
        remark: "Completion report signed by " + args.actor.full_name + ".",
      });
    }
  });
}

/** Final Bill stage: Finance settles the outstanding dues. */
export function fnSettleFinalBill(args: { actor: Profile; project_id: string }) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    const finance = db.departments.find((d) => d.code === "FIN");
    if (args.actor.department_id !== finance?.id && args.actor.role !== "SUPER_ADMIN") {
      throw new RuleError("Only Finance can settle the final bill.");
    }
    if (project.current_stage_key !== "FINAL_BILL") {
      throw new RuleError("The project is not at the Final Bill stage.");
    }
    const now = nowApp().toISOString();
    for (const bill of db.ra_bills.filter((b) => b.project_id === project.id && b.status !== "PAID")) {
      bill.status = "PAID";
      bill.paid_at = now;
    }
    const inst = db.stage_instances.find((s) => s.id === project.current_stage_instance_id);
    if (inst) {
      logMovement(db, {
        project_id: project.id,
        stage_instance_id: inst.id,
        action: "NOTE",
        from_desk_id: args.actor.desk_id,
        actor_id: args.actor.id,
        remark: "Final bill settled. All dues cleared.",
      });
    }
  });
}

/** DLP stage: closing the project ends the flow. */
export function fnCloseProject(args: { actor: Profile; project_id: string }) {
  return writeDb((db) => {
    const project = must(db.projects.find((p) => p.id === args.project_id), "Unknown project.");
    if (project.current_stage_key !== "DLP_CLOSURE") {
      throw new RuleError("A project can only be closed at the Defect Liability stage.");
    }
    const inst = must(
      db.stage_instances.find((s) => s.id === project.current_stage_instance_id),
      "No active stage instance.",
    );
    const check = validateTransition({
      kind: "APPROVE",
      user: args.actor,
      project,
      departments: db.departments,
      instance: inst,
      openSubtasks: openSubtaskCount(db, inst.id),
    });
    if (!check.allowed) throw new RuleError(check.reason ?? "Not allowed.");
    if (new Date(inst.due_at).getTime() > nowApp().getTime()) {
      throw new RuleError("The defect liability period has not finished yet.");
    }
    inst.status = "APPROVED";
    inst.ended_at = nowApp().toISOString();
    project.status = "COMPLETED";
    logMovement(db, {
      project_id: project.id,
      stage_instance_id: inst.id,
      action: "APPROVED",
      from_desk_id: inst.holder_desk_id,
      actor_id: args.actor.id,
      remark: "Defect liability period completed. Project closed.",
    });
  });
}

export { getDb, nowApp };
