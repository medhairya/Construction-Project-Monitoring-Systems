import Link from "next/link";
import { notFound } from "next/navigation";
import { EyeOff } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { findProject, movementsFor } from "@/lib/db/queries";
import { getDb, nowApp } from "@/lib/db/store";
import { stageName } from "@/lib/domain/stages";
import { Alert, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { formatDateTime, relativeDays } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MovementPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();
  const { projectId } = await params;
  const project = findProject(decodeURIComponent(projectId));
  if (!project) notFound();

  const db = getDb();
  const now = nowApp();
  const movements = movementsFor(project.id, user);
  const instances = Object.fromEntries(db.stage_instances.map((s) => [s.id, s]));

  // Other departments collapse into one summary line per stage instance.
  const hiddenByInstance = new Map<string, number>();
  for (const m of movements) {
    if (!m.visible) {
      hiddenByInstance.set(
        m.movement.stage_instance_id,
        (hiddenByInstance.get(m.movement.stage_instance_id) ?? 0) + 1,
      );
    }
  }

  const rendered: { key: string; node: React.ReactNode }[] = [];
  const emittedSummary = new Set<string>();

  for (const m of movements) {
    if (m.visible) {
      rendered.push({
        key: m.movement.id,
        node: (
          <li className="relative pl-6">
            <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-sky-700" />
            <p className="text-sm font-medium text-slate-800">
              {m.movement.action.replace(/_/g, " ").toLowerCase()}
              <span className="font-normal text-slate-600">
                {" "}
                · {m.fromDesk ? m.fromDesk.designation : "—"} → {m.toDesk ? m.toDesk.designation : "—"}
              </span>
            </p>
            {m.movement.remark ? (
              <p className="mt-0.5 text-xs text-slate-600">{m.movement.remark}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-slate-600">
              {formatDateTime(m.movement.created_at)} · {relativeDays(m.movement.created_at, now)} ·
              by {m.actorName} ·{" "}
              {instances[m.movement.stage_instance_id]
                ? stageName(instances[m.movement.stage_instance_id].stage_key)
                : "—"}
            </p>
          </li>
        ),
      });
    } else {
      const instId = m.movement.stage_instance_id;
      if (emittedSummary.has(instId)) continue;
      emittedSummary.add(instId);
      const inst = instances[instId];
      const dept = db.departments.find((d) => d.id === m.departmentId);
      const days = inst
        ? Math.max(
            0,
            Math.floor(
              ((inst.ended_at ? new Date(inst.ended_at) : now).getTime() -
                new Date(inst.started_at).getTime()) /
                86_400_000,
            ),
          )
        : 0;
      rendered.push({
        key: "sum-" + instId,
        node: (
          <li className="relative pl-6">
            <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300" />
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <EyeOff className="h-3.5 w-3.5 text-slate-600" />
              With {dept?.name ?? "another department"} · {days} days · SLA{" "}
              {inst?.sla_days ?? "—"} days
            </p>
            <p className="text-[11px] text-slate-600">
              {hiddenByInstance.get(instId)} desk movements — visible to that department only.
            </p>
          </li>
        ),
      });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={"/projects/" + project.project_code}
          className="text-xs font-medium text-sky-700 hover:underline"
        >
          ← {project.project_code}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Movement log</h1>
        <p className="text-sm text-slate-600">{project.title}</p>
      </div>

      <Alert tone="info">
        Desk-level detail is shown for your own department only. Other departments appear as a
        summary line — this is the visibility rule in Section 1.3 of the plan.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Desk-to-desk timeline (append-only)</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-5 border-l border-slate-200 pl-2">
            {rendered.map((r) => (
              <div key={r.key}>{r.node}</div>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
