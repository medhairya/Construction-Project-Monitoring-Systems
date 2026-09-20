import "server-only";
import { STAGE_BY_KEY } from "@/lib/domain/stages";
import { slaState, type SlaState } from "@/lib/sla";
import { delayAttribution, progressState, reportCompliance } from "@/lib/execution";
import { canSeeProject, departmentOfDesk } from "@/lib/rbac";
import type {
  Desk,
  Escalation,
  FileMovement,
  Profile,
  Project,
  StageInstance,
} from "@/lib/domain/types";
import { getDb, nowApp } from "./store";
import { fnSlaSweep } from "./rpc";

export interface ProjectView {
  project: Project;
  instance: StageInstance | null;
  sla: SlaState | null;
  districtName: string;
  ownerDeptName: string;
  holderDesk: Desk | null;
  escalation: Escalation | null;
}

export function projectView(project: Project): ProjectView {
  const db = getDb();
  const now = nowApp();
  const instance =
    db.stage_instances.find((s) => s.id === project.current_stage_instance_id) ?? null;
  const ownerCode = STAGE_BY_KEY[project.current_stage_key].owner_department_code;
  const holderDesk = instance?.holder_desk_id
    ? db.desks.find((d) => d.id === instance.holder_desk_id) ?? null
    : null;
  return {
    project,
    instance,
    sla: instance ? slaState(instance.started_at, instance.due_at, now, instance.ended_at) : null,
    districtName: db.districts.find((d) => d.id === project.district_id)?.name ?? "—",
    ownerDeptName: db.departments.find((d) => d.code === ownerCode)?.name ?? "—",
    holderDesk,
    escalation:
      db.escalations.find(
        (e) => e.stage_instance_id === instance?.id && e.status !== "DECIDED",
      ) ?? null,
  };
}

/** Runs the SLA sweep on read, so a page load can never show a stale breach. */
export function sweepAndList(user: Profile): ProjectView[] {
  fnSlaSweep();
  const db = getDb();
  return db.projects
    .filter((p) => canSeeProject(user, p))
    .map(projectView)
    .sort((a, b) => {
      if (a.project.priority !== b.project.priority) return a.project.priority === "HIGH" ? -1 : 1;
      const ra = a.sla?.daysRemaining ?? 9999;
      const rb = b.sla?.daysRemaining ?? 9999;
      return ra - rb;
    });
}

export function findProject(idOrCode: string): Project | null {
  const db = getDb();
  const needle = idOrCode.trim().toUpperCase();
  return (
    db.projects.find((p) => p.id === idOrCode || p.project_code.toUpperCase() === needle) ?? null
  );
}

export function stageHistory(projectId: string): StageInstance[] {
  return getDb()
    .stage_instances.filter((s) => s.project_id === projectId)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
}

export interface MovementView {
  movement: FileMovement;
  fromDesk: Desk | null;
  toDesk: Desk | null;
  actorName: string;
  departmentId: string | null;
  visible: boolean;
}

/** Applies Section 1.3: desk detail only for your own department. */
export function movementsFor(projectId: string, user: Profile): MovementView[] {
  const db = getDb();
  return db.file_movements
    .filter((m) => m.project_id === projectId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((m) => {
      const fromDesk = db.desks.find((d) => d.id === m.from_desk_id) ?? null;
      const toDesk = db.desks.find((d) => d.id === m.to_desk_id) ?? null;
      const departmentId =
        departmentOfDesk(m.to_desk_id, db.desks) ?? departmentOfDesk(m.from_desk_id, db.desks);
      const visible =
        user.role === "MINISTRY" ||
        user.role === "SUPER_ADMIN" ||
        (user.role !== "SITE_ENGINEER" && departmentId === user.department_id);
      return {
        movement: m,
        fromDesk,
        toDesk,
        actorName: db.profiles.find((p) => p.id === m.actor_id)?.full_name ?? "System",
        departmentId,
        visible,
      };
    });
}

/** Files currently sitting in the user's department. */
export function inboxFor(user: Profile): ProjectView[] {
  fnSlaSweep();
  const db = getDb();
  const deptId = user.department_id;
  return db.projects
    .filter((p) => p.status === "ACTIVE" || p.status === "ESCALATED")
    .map(projectView)
    .filter((v) => {
      if (!v.instance) return false;
      const ownerCode = STAGE_BY_KEY[v.instance.stage_key].owner_department_code;
      const ownerDept = db.departments.find((d) => d.code === ownerCode);
      if (user.role === "MINISTRY" || user.role === "SUPER_ADMIN") return true;
      if (user.role === "SITE_ENGINEER") return canSeeProject(user, v.project);
      return ownerDept?.id === deptId;
    })
    .sort((a, b) => {
      if (a.project.priority !== b.project.priority) return a.project.priority === "HIGH" ? -1 : 1;
      return (a.sla?.daysRemaining ?? 9999) - (b.sla?.daysRemaining ?? 9999);
    });
}

export interface EscalationView {
  escalation: Escalation;
  project: Project;
  instance: StageInstance | null;
  stageName: string;
  daysOverdue: number;
  hasJustification: boolean;
  messageCount: number;
  decided: boolean;
}

export function escalationViews(): EscalationView[] {
  fnSlaSweep();
  const db = getDb();
  const now = nowApp();
  return db.escalations
    .map((e) => {
      const project = db.projects.find((p) => p.id === e.project_id)!;
      const instance = db.stage_instances.find((s) => s.id === e.stage_instance_id) ?? null;
      const thread = db.chat_threads.find((t) => t.escalation_id === e.id);
      return {
        escalation: e,
        project,
        instance,
        stageName: instance ? STAGE_BY_KEY[instance.stage_key].name : "—",
        daysOverdue: Math.max(
          0,
          Math.floor((now.getTime() - new Date(e.breached_at).getTime()) / 86_400_000),
        ),
        hasJustification: db.justifications.some((j) => j.escalation_id === e.id),
        messageCount: thread
          ? db.chat_messages.filter((m) => m.thread_id === thread.id).length
          : 0,
        decided: e.status === "DECIDED",
      };
    })
    .filter((v) => Boolean(v.project))
    .sort((a, b) => {
      if (a.decided !== b.decided) return a.decided ? 1 : -1;
      return b.daysOverdue - a.daysOverdue;
    });
}

export function escalationDetail(id: string) {
  const db = getDb();
  const esc = db.escalations.find((e) => e.id === id);
  if (!esc) return null;
  const thread = db.chat_threads.find((t) => t.escalation_id === esc.id) ?? null;
  return {
    escalation: esc,
    project: db.projects.find((p) => p.id === esc.project_id)!,
    instance: db.stage_instances.find((s) => s.id === esc.stage_instance_id) ?? null,
    justification: db.justifications.find((j) => j.escalation_id === esc.id) ?? null,
    thread,
    messages: thread
      ? db.chat_messages
          .filter((m) => m.thread_id === thread.id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
      : [],
    decision: db.decisions.find((d) => d.escalation_id === esc.id) ?? null,
    profiles: db.profiles,
  };
}

/** Everything the execution / closure page needs for one project. */
export function executionView(projectId: string) {
  const db = getDb();
  const now = nowApp();
  const project = db.projects.find((p) => p.id === projectId)!;
  const instances = db.stage_instances
    .filter((s) => s.project_id === projectId)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const checklist = db.execution_checklist_items.filter((c) => c.project_id === projectId);
  const reports = db.execution_reports
    .filter((r) => r.project_id === projectId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const bills = db.ra_bills
    .filter((b) => b.project_id === projectId)
    .sort((a, b) => a.bill_no.localeCompare(b.bill_no));
  const eots = db.eot_requests
    .filter((e) => e.project_id === projectId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const executionInstance =
    instances.filter((s) => s.stage_key === "SITE_EXECUTION").slice(-1)[0] ?? null;

  const escalations = db.escalations.filter((e) => e.project_id === projectId);
  const attribution = delayAttribution({
    instances,
    escalations,
    decisions: db.decisions.filter((d) => escalations.some((e) => e.id === d.escalation_id)),
    eots,
    bills,
    now,
    stageNameOf: (inst) => STAGE_BY_KEY[inst.stage_key].name,
  });

  return {
    project,
    checklist,
    reports,
    bills,
    eots,
    executionInstance,
    progress: checklist.length > 0 ? progressState(checklist, now) : null,
    compliance: executionInstance
      ? reportCompliance(reports, executionInstance.started_at, now)
      : null,
    attribution,
    completion: db.completion_reports.find((c) => c.project_id === projectId) ?? null,
    profiles: db.profiles,
  };
}

export interface Kpis {
  active: number;
  escalated: number;
  atRisk: number;
  completed: number;
  byStage: { stage: string; count: number }[];
}

export function kpisFor(user: Profile): Kpis {
  const views = sweepAndList(user);
  const byStage = new Map<string, number>();
  for (const v of views) {
    if (v.project.status === "COMPLETED" || v.project.status === "CANCELLED") continue;
    const name = STAGE_BY_KEY[v.project.current_stage_key].name;
    byStage.set(name, (byStage.get(name) ?? 0) + 1);
  }
  return {
    active: views.filter((v) => v.project.status === "ACTIVE").length,
    escalated: views.filter((v) => v.project.status === "ESCALATED").length,
    atRisk: views.filter((v) => v.sla?.level === "AMBER").length,
    completed: views.filter((v) => v.project.status === "COMPLETED").length,
    byStage: [...byStage.entries()].map(([stage, count]) => ({ stage, count })),
  };
}
