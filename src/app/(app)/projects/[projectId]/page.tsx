import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, RotateCcw } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { findProject, movementsFor, projectView, stageHistory } from "@/lib/db/queries";
import { getDb, nowApp } from "@/lib/db/store";
import { STAGE_DEFINITIONS, stageName, stageSeq, stageShortName } from "@/lib/domain/stages";
import { canApprove, canForward, previousStages, nextStage, ownerDepartmentCode } from "@/lib/workflow";
import { slaState } from "@/lib/sla";
import { Alert, Card, CardBody, CardHeader, CardTitle, Td, Th } from "@/components/ui";
import { PriorityBadge, SlaBar, SlaPill, StageStatusBadge, StatusBadge } from "@/components/status";
import { ActionBar } from "@/components/action-bar";
import { formatCost, formatDate, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  approved: "Stage approved. The file has moved to the next stage.",
  completed: "Final stage approved. The project is now complete.",
  returned:
    "File returned. A new stage instance was opened at the target stage and its SLA restarted.",
};

export default async function PassportPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ created?: string; msg?: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const sp = await searchParams;
  const project = findProject(decodeURIComponent(projectId));
  if (!project) notFound();

  const db = getDb();
  const now = nowApp();
  const view = projectView(project);
  const history = stageHistory(project.id);
  const movements = movementsFor(project.id, user).slice(0, 8);
  const instance = view.instance;

  const approve = canApprove(user, project, db.departments);
  const ownerCode = ownerDepartmentCode(project.current_stage_key);
  const ownerDept = db.departments.find((d) => d.code === ownerCode);
  const myDesks = db.desks.filter((d) => d.department_id === user.department_id);
  const forward =
    ownerDept?.id === user.department_id
      ? canForward(user, project, { department_id: user.department_id ?? "" })
      : { allowed: false, reason: "The file is with " + (ownerDept?.name ?? "another department") + "." };

  const subtasks = instance ? db.subtasks.filter((s) => s.stage_instance_id === instance.id) : [];
  const deskNameById = Object.fromEntries(db.desks.map((d) => [d.id, d.designation]));
  const next = nextStage(project.current_stage_key);

  // Per-stage roll-up for the stepper.
  const byStage = STAGE_DEFINITIONS.map((def) => {
    const visits = history.filter((h) => h.stage_key === def.key);
    const current = project.current_stage_key === def.key;
    const done = visits.some((v) => v.status === "APPROVED");
    const daysSpent = visits.reduce((acc, v) => {
      const s = slaState(v.started_at, v.due_at, now, v.ended_at);
      return acc + s.daysUsed;
    }, 0);
    return { def, visits, current, done, daysSpent };
  });

  return (
    <div className="space-y-6">
      {sp.created ? (
        <Alert tone="success">
          Proposal created. Project ID <strong>{project.project_code}</strong> has been generated and
          the file is now at Stage 1.
        </Alert>
      ) : null}

      {sp.msg && MESSAGES[sp.msg] ? <Alert tone="success">{MESSAGES[sp.msg]}</Alert> : null}

      {project.status === "ESCALATED" && view.escalation ? (
        <Alert tone="error">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>
              SLA breached at {stageName(project.current_stage_key)}. Forward movement is frozen
              until the Ministry records a decision.
            </span>
            <Link
              href={"/escalations/" + view.escalation.id}
              className="font-semibold underline underline-offset-2"
            >
              Open escalation
            </Link>
          </div>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-semibold text-slate-900">
              {project.project_code}
            </h1>
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </div>
          <p className="mt-1 text-sm text-slate-700">{project.title}</p>
          <p className="text-xs text-slate-600">
            {view.districtName} · {formatCost(project.sanctioned_cost)} · created{" "}
            {formatDate(project.created_at)}
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <Link
            href={"/projects/" + project.project_code + "/movement"}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            Movement log
          </Link>
          <Link
            href={"/projects/" + project.project_code + "/execution"}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
          >
            Execution
          </Link>
        </div>
      </div>

      {/* Stepper */}
      <Card>
        <CardHeader>
          <CardTitle>Project passport — 9 stages</CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
            {byStage.map(({ def, visits, current, done, daysSpent }) => {
              const active = visits.find((v) => v.ended_at === null);
              const sla = active ? slaState(active.started_at, active.due_at, now, null) : null;
              const tone = current
                ? sla?.level === "RED"
                  ? "border-red-400 bg-red-50"
                  : sla?.level === "AMBER"
                    ? "border-amber-400 bg-amber-50"
                    : "border-sky-500 bg-sky-50"
                : done
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-slate-200 bg-slate-50";
              return (
                <li key={def.key} className={"rounded-md border p-3 " + tone}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    Stage {def.seq}
                  </p>
                  <p className="text-xs font-semibold text-slate-800">{stageShortName(def.key)}</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {db.departments.find((d) => d.code === def.owner_department_code)?.name}
                  </p>
                  <p className="mt-2 text-[11px] text-slate-700">
                    {visits.length === 0
                      ? "not reached"
                      : daysSpent + "d spent · SLA " + (active?.sla_days ?? def.default_sla_days) + "d"}
                  </p>
                  {visits.length > 1 ? (
                    <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700">
                      <RotateCcw className="h-3 w-3" /> {visits.length} attempts
                    </p>
                  ) : null}
                  {visits.some((v) => v.entered_via === "REENTRY") ? (
                    <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-red-700">
                      <ArrowLeftRight className="h-3 w-3" /> re-entered
                    </p>
                  ) : null}
                  {current && sla ? (
                    <div className="mt-2">
                      <SlaBar sla={sla} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Stage history (every visit, including returns)</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr>
                      <Th>Stage</Th>
                      <Th>Attempt</Th>
                      <Th>Entered</Th>
                      <Th>Started</Th>
                      <Th>Days vs SLA</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => {
                      const s = slaState(h.started_at, h.due_at, now, h.ended_at);
                      return (
                        <tr key={h.id}>
                          <Td className="text-xs">
                            {stageSeq(h.stage_key)}. {stageName(h.stage_key)}
                          </Td>
                          <Td className="text-xs">#{h.attempt_no}</Td>
                          <Td className="text-xs">{h.entered_via.toLowerCase()}</Td>
                          <Td className="text-xs">{formatDate(h.started_at)}</Td>
                          <Td className="text-xs">
                            {s.daysUsed}d / {h.sla_days}d
                          </Td>
                          <Td>
                            <StageStatusBadge status={h.status} />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Recent movement</CardTitle>
              <Link
                href={"/projects/" + project.project_code + "/movement"}
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Full log
              </Link>
            </CardHeader>
            <CardBody className="space-y-3">
              {movements.map((m) => (
                <div key={m.movement.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="text-xs font-medium text-slate-800">
                    {m.movement.action.replace(/_/g, " ").toLowerCase()}
                    {m.visible ? (
                      <span className="font-normal text-slate-600">
                        {" "}
                        · {m.fromDesk?.designation ?? "—"} → {m.toDesk?.designation ?? "—"}
                      </span>
                    ) : (
                      <span className="font-normal text-slate-600"> · desk detail hidden</span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-600">
                    {formatDateTime(m.movement.created_at)}
                    {m.visible && m.movement.remark ? " · " + m.movement.remark : ""}
                  </p>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Current stage</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2 text-xs text-slate-700">
              <p className="text-sm font-semibold text-slate-900">
                {stageName(project.current_stage_key)}
              </p>
              <p>With {view.ownerDeptName}</p>
              <p>
                Desk:{" "}
                {forward.allowed || user.role === "MINISTRY" || user.role === "SUPER_ADMIN"
                  ? (view.holderDesk?.designation ?? "—") +
                    (view.holderDesk ? " (" + view.holderDesk.officer_name + ")" : "")
                  : "visible to " + view.ownerDeptName + " only"}
              </p>
              <div className="pt-1">
                <SlaPill sla={view.sla} slaDays={instance?.sla_days} />
              </div>
              <div className="pt-1">
                <SlaBar sla={view.sla} />
              </div>
              <p className="pt-1 text-[11px] text-slate-600">
                Due {formatDate(instance?.due_at)} · {view.sla?.pctUsed ?? 0}% of the SLA used
              </p>
            </CardBody>
          </Card>

          <ActionBar
            projectId={project.id}
            approve={approve}
            forward={forward}
            returnTargets={previousStages(project.current_stage_key)}
            desks={myDesks.map((d) => ({
              id: d.id,
              designation: d.designation,
              officer_name: d.officer_name,
            }))}
            subtasks={subtasks}
            deskNameById={deskNameById}
            nextStageName={next ? stageName(next) : null}
          />

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-xs leading-relaxed text-slate-600">{project.description}</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
