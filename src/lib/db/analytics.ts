import "server-only";
import { STAGE_BY_KEY, stageName } from "@/lib/domain/stages";
import { slaState } from "@/lib/sla";
import { reportCompliance } from "@/lib/execution";
import type { Profile, Project } from "@/lib/domain/types";
import { getDb, nowApp } from "./store";
import { inboxFor, sweepAndList } from "./queries";

// --- Ministry ------------------------------------------------------------

export interface DistrictRow {
  district: string;
  total: number;
  active: number;
  escalated: number;
  atRisk: number;
  completed: number;
  sanctionedCost: number;
}

export function districtOverview(): DistrictRow[] {
  const db = getDb();
  const now = nowApp();
  return db.districts.map((d) => {
    const rows = db.projects.filter((p) => p.district_id === d.id);
    let atRisk = 0;
    for (const p of rows) {
      const inst = db.stage_instances.find((s) => s.id === p.current_stage_instance_id);
      if (!inst || p.status !== "ACTIVE") continue;
      if (slaState(inst.started_at, inst.due_at, now, inst.ended_at).level === "AMBER") atRisk += 1;
    }
    return {
      district: d.name,
      total: rows.length,
      active: rows.filter((p) => p.status === "ACTIVE").length,
      escalated: rows.filter((p) => p.status === "ESCALATED").length,
      atRisk,
      completed: rows.filter((p) => p.status === "COMPLETED").length,
      sanctionedCost: rows.reduce((a, p) => a + p.sanctioned_cost, 0),
    };
  });
}

export interface StageLoadRow {
  stage: string;
  count: number;
  avgDays: number;
}

/** How many files sit at each stage now, and how long they have been there. */
export function stageLoad(): StageLoadRow[] {
  const db = getDb();
  const now = nowApp();
  const rows = new Map<string, { count: number; days: number }>();
  for (const project of db.projects) {
    if (project.status === "COMPLETED" || project.status === "CANCELLED") continue;
    const inst = db.stage_instances.find((s) => s.id === project.current_stage_instance_id);
    if (!inst) continue;
    const name = stageName(inst.stage_key);
    const entry = rows.get(name) ?? { count: 0, days: 0 };
    entry.count += 1;
    entry.days += slaState(inst.started_at, inst.due_at, now, null).daysUsed;
    rows.set(name, entry);
  }
  return [...rows.entries()].map(([stage, v]) => ({
    stage,
    count: v.count,
    avgDays: Math.round(v.days / Math.max(v.count, 1)),
  }));
}

// --- Department head -----------------------------------------------------

export interface DeskLoadRow {
  desk: string;
  officer: string;
  holding: number;
  avgDaysHeld: number;
  handled: number;
  /** Average days a file historically sat at this desk before moving on. */
  avgTurnaround: number;
}

/**
 * Desk performance inside one department: what each desk holds now and how
 * long it usually takes to pass a file on. The slowest desk is the bottleneck.
 */
export function deskLoad(departmentId: string): DeskLoadRow[] {
  const db = getDb();
  const now = nowApp();
  const desks = db.desks.filter((d) => d.department_id === departmentId);

  return desks.map((desk) => {
    const holdingInstances = db.stage_instances.filter(
      (s) => s.holder_desk_id === desk.id && s.ended_at === null,
    );
    const daysHeld = holdingInstances.map((inst) => {
      const arrival = db.file_movements
        .filter((m) => m.stage_instance_id === inst.id && m.to_desk_id === desk.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const from = arrival ? new Date(arrival.created_at) : new Date(inst.started_at);
      return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
    });

    // Completed hops: arrival at this desk followed by the next movement away.
    const arrivals = db.file_movements
      .filter((m) => m.to_desk_id === desk.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const turnarounds: number[] = [];
    for (const arrival of arrivals) {
      const departure = db.file_movements
        .filter(
          (m) =>
            m.stage_instance_id === arrival.stage_instance_id &&
            m.created_at > arrival.created_at &&
            (m.from_desk_id === desk.id || m.action === "APPROVED" || m.action === "RETURNED"),
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (departure) {
        turnarounds.push(
          (new Date(departure.created_at).getTime() - new Date(arrival.created_at).getTime()) /
            86_400_000,
        );
      }
    }

    return {
      desk: desk.designation,
      officer: desk.officer_name,
      holding: holdingInstances.length,
      avgDaysHeld: daysHeld.length
        ? Math.round(daysHeld.reduce((a, b) => a + b, 0) / daysHeld.length)
        : 0,
      handled: turnarounds.length,
      avgTurnaround: turnarounds.length
        ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length)
        : 0,
    };
  });
}

export function bottleneckDesk(departmentId: string): DeskLoadRow | null {
  const rows = deskLoad(departmentId).filter((r) => r.holding > 0 || r.handled > 0);
  if (rows.length === 0) return null;
  return [...rows].sort(
    (a, b) => b.avgDaysHeld + b.avgTurnaround - (a.avgDaysHeld + a.avgTurnaround),
  )[0];
}

export interface InboxHealth {
  total: number;
  green: number;
  amber: number;
  red: number;
  highPriority: number;
}

export function inboxHealth(user: Profile): InboxHealth {
  const rows = inboxFor(user);
  return {
    total: rows.length,
    green: rows.filter((r) => r.sla?.level === "GREEN").length,
    amber: rows.filter((r) => r.sla?.level === "AMBER").length,
    red: rows.filter((r) => r.sla?.level === "RED").length,
    highPriority: rows.filter((r) => r.project.priority === "HIGH").length,
  };
}

// --- Site engineer -------------------------------------------------------

export interface SiteRow {
  project: Project;
  progressPct: number;
  missedReports: number;
  lastReport: string | null;
  dueAt: string | null;
}

export function siteSummary(user: Profile): SiteRow[] {
  const db = getDb();
  const now = nowApp();
  return db.projects
    .filter((p) => p.assigned_site_engineer_id === user.id)
    .map((project) => {
      const checklist = db.execution_checklist_items.filter((c) => c.project_id === project.id);
      const reports = db.execution_reports
        .filter((r) => r.project_id === project.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const inst = db.stage_instances.find((s) => s.id === project.current_stage_instance_id);
      return {
        project,
        progressPct: Math.round(
          checklist.reduce((a, c) => a + (c.weight_pct * c.actual_pct) / 100, 0),
        ),
        missedReports: inst ? reportCompliance(reports, inst.started_at, now).missed : 0,
        lastReport: reports[0]?.created_at ?? null,
        dueAt: inst?.due_at ?? null,
      };
    });
}

// --- Notifications -------------------------------------------------------

export type NotificationKind = "INBOX" | "AT_RISK" | "BREACH" | "CHAT" | "DECISION";

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  href: string;
  at: string;
  urgent: boolean;
}

/**
 * Derived, not stored: the bell recomputes from current state on each load,
 * so there is no notification table to keep in step.
 */
export function notificationsFor(user: Profile): Notification[] {
  const db = getDb();
  const now = nowApp();
  const out: Notification[] = [];
  const mine = inboxFor(user);

  for (const v of mine) {
    if (!v.instance || !v.sla) continue;
    const href = "/projects/" + v.project.project_code;

    if (v.sla.breached) {
      out.push({
        id: "breach-" + v.instance.id,
        kind: "BREACH",
        title: "SLA breached · " + v.project.project_code,
        detail:
          stageName(v.instance.stage_key) +
          " is " +
          Math.abs(v.sla.daysRemaining) +
          " days overdue. Movement is frozen.",
        href,
        at: v.instance.due_at,
        urgent: true,
      });
    } else if (v.sla.level === "AMBER") {
      out.push({
        id: "risk-" + v.instance.id,
        kind: "AT_RISK",
        title: "SLA at " + v.sla.pctUsed + "% · " + v.project.project_code,
        detail: v.sla.daysRemaining + " days left at " + stageName(v.instance.stage_key) + ".",
        href,
        at: v.instance.started_at,
        urgent: false,
      });
    }

    // Arrived in this department within the last 3 days.
    const arrivedDays = (now.getTime() - new Date(v.instance.started_at).getTime()) / 86_400_000;
    if (arrivedDays <= 3) {
      out.push({
        id: "inbox-" + v.instance.id,
        kind: "INBOX",
        title: "New file in your inbox · " + v.project.project_code,
        detail:
          v.project.title +
          " arrived at " +
          STAGE_BY_KEY[v.instance.stage_key].name +
          (v.project.priority === "HIGH" ? " with HIGH priority." : "."),
        href,
        at: v.instance.started_at,
        urgent: v.project.priority === "HIGH",
      });
    }
  }

  // Chat messages and decisions on escalations the user can act on.
  for (const esc of db.escalations) {
    const project = db.projects.find((p) => p.id === esc.project_id);
    if (!project) continue;
    const thread = db.chat_threads.find((t) => t.escalation_id === esc.id);
    const messages = thread
      ? db.chat_messages
          .filter((m) => m.thread_id === thread.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
      : [];
    const last = messages[0];
    if (last && last.sender_id !== user.id) {
      out.push({
        id: "chat-" + last.id,
        kind: "CHAT",
        title: "New message on " + project.project_code,
        detail:
          (db.profiles.find((p) => p.id === last.sender_id)?.full_name ?? "Someone") +
          ": " +
          last.body.slice(0, 80),
        href: "/escalations/" + esc.id,
        at: last.created_at,
        urgent: false,
      });
    }
    const decision = db.decisions.find((d) => d.escalation_id === esc.id);
    if (decision) {
      out.push({
        id: "decision-" + decision.id,
        kind: "DECISION",
        title: "Ministry decision · " + project.project_code,
        detail:
          decision.decision_type.replace(/_/g, " ").toLowerCase() +
          " · new SLA " +
          decision.new_sla_days +
          " days · priority " +
          decision.priority.toLowerCase(),
        href: "/escalations/" + esc.id,
        at: decision.created_at,
        urgent: false,
      });
    }
  }

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
}

export function ministryHighPriority() {
  const db = getDb();
  return sweepAndList(db.profiles.find((p) => p.role === "MINISTRY")!).filter(
    (v) => v.project.priority === "HIGH" && v.project.status !== "COMPLETED",
  );
}
