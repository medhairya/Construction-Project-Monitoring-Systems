import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { escalationDetail } from "@/lib/db/queries";
import { nowApp } from "@/lib/db/store";
import { stageName } from "@/lib/domain/stages";
import { previousStages } from "@/lib/workflow";
import { ROLE_LABEL } from "@/lib/rbac";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { PriorityBadge, StatusBadge } from "@/components/status";
import { EscalationTabs } from "./tabs";
import { formatDate, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EscalationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const detail = escalationDetail(id);
  if (!detail) notFound();

  const { escalation, project, instance, justification, messages, decision, profiles } = detail;
  const now = nowApp();
  const daysOverdue = Math.max(
    0,
    Math.floor((now.getTime() - new Date(escalation.breached_at).getTime()) / 86_400_000),
  );

  // Re-entry choices: stage 1 up to the breached stage (R7.5).
  const breachedStage = instance?.stage_key ?? project.current_stage_key;
  const reentryStages = [...previousStages(breachedStage), breachedStage];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/escalations" className="text-xs font-medium text-sky-700 hover:underline">
          ← Escalations
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-lg font-semibold text-slate-900">{project.project_code}</h1>
          <StatusBadge status={project.status} />
          <PriorityBadge priority={project.priority} />
          <Badge className="border-slate-200 bg-slate-100 text-slate-600">
            {titleCase(escalation.status)}
          </Badge>
        </div>
        <p className="text-sm text-slate-700">{project.title}</p>
        <p className="text-xs text-slate-600">
          Breached at {stageName(breachedStage)} on {formatDate(escalation.breached_at)} ·{" "}
          {daysOverdue} days overdue · SLA was {instance?.sla_days ?? "—"} days
        </p>
      </div>

      {escalation.status !== "DECIDED" ? (
        <Alert tone="error">
          Forward movement on this project is frozen until the Ministry records a decision (R7.1).
        </Alert>
      ) : (
        <Alert tone="success">
          A decision is on record. The project re-entered the flow at{" "}
          {decision ? stageName(decision.reentry_stage_key) : "—"} with priority{" "}
          {decision?.priority.toLowerCase()} and a {decision?.new_sla_days}-day SLA.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EscalationTabs
            escalationId={escalation.id}
            status={escalation.status}
            canJustify={user.role !== "MINISTRY" && user.role !== "SUPER_ADMIN"}
            isMinistry={user.role === "MINISTRY"}
            currentUserId={user.id}
            justification={
              justification
                ? {
                    ...justification,
                    submitterName:
                      profiles.find((p) => p.id === justification.submitted_by)?.full_name ?? "—",
                  }
                : null
            }
            messages={messages.map((m) => {
              const sender = profiles.find((p) => p.id === m.sender_id);
              return {
                id: m.id,
                body: m.body,
                created_at: m.created_at,
                senderName: sender?.full_name ?? "—",
                senderRole: sender ? ROLE_LABEL[sender.role] : "—",
                mine: m.sender_id === user.id,
              };
            })}
            decision={
              decision
                ? {
                    ...decision,
                    deciderName: profiles.find((p) => p.id === decision.decided_by)?.full_name ?? "—",
                    reentryStageName: stageName(decision.reentry_stage_key),
                  }
                : null
            }
            reentryStages={reentryStages.map((s) => ({ key: s, name: stageName(s) }))}
            defaultSla={instance?.sla_days ?? 15}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>How this is resolved (R7)</CardTitle>
            </CardHeader>
            <CardBody>
              <ol className="space-y-2 text-xs text-slate-600">
                <li className={justification ? "text-emerald-700" : "font-semibold text-slate-900"}>
                  1. Holding officer submits a structured justification
                  {justification ? " ✓" : ""}
                </li>
                <li className={messages.length > 0 ? "text-emerald-700" : ""}>
                  2. Ministry opens an official chat (permanently logged)
                  {messages.length > 0 ? " ✓" : ""}
                </li>
                <li className={decision ? "text-emerald-700" : ""}>
                  3. Ministry records a structured decision{decision ? " ✓" : ""}
                </li>
                <li className={decision ? "text-emerald-700" : ""}>
                  4. File re-enters the flow with HIGH priority and a new SLA
                  {decision ? " ✓" : ""}
                </li>
              </ol>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project</CardTitle>
            </CardHeader>
            <CardBody className="space-y-1 text-xs text-slate-600">
              <p>{project.description}</p>
              <Link
                href={"/projects/" + project.project_code}
                className="mt-2 inline-block font-medium text-sky-700 hover:underline"
              >
                Open the project passport →
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
