import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { executionView, findProject } from "@/lib/db/queries";
import { getDb, nowApp } from "@/lib/db/store";
import { stageSeq } from "@/lib/domain/stages";
import { slaState } from "@/lib/sla";
import { Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, Td, Th } from "@/components/ui";
import {
  BillActions,
  CloseProjectPanel,
  CompletionReportForm,
  EotDecision,
  EotForm,
  RaBillForm,
  ReportForm,
  SettleFinalBillPanel,
} from "./forms";
import { formatCost, formatDate, formatDateTime, titleCase } from "@/lib/utils";

export const dynamic = "force-dynamic";

const BILL_TONE: Record<string, string> = {
  SUBMITTED: "border-slate-200 bg-slate-100 text-slate-600",
  VERIFIED: "border-amber-200 bg-amber-50 text-amber-700",
  PAID: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export default async function ExecutionPage({
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
  const view = executionView(project.id);
  const {
    checklist,
    reports,
    bills,
    eots,
    progress,
    compliance,
    attribution,
    completion,
    executionInstance,
  } = view;

  const seq = stageSeq(project.current_stage_key);
  const isSite = user.role === "SITE_ENGINEER" && project.assigned_site_engineer_id === user.id;
  const isEe = user.role === "DEPT_HEAD";
  const financeDept = db.departments.find((d) => d.code === "FIN");
  const isFinance = user.department_id === financeDept?.id || user.role === "SUPER_ADMIN";
  const dues = bills.filter((b) => b.status !== "PAID").reduce((a, b) => a + b.amount, 0);
  const currentInstance = db.stage_instances.find((s) => s.id === project.current_stage_instance_id);
  const dlpSla = currentInstance
    ? slaState(currentInstance.started_at, currentInstance.due_at, now, currentInstance.ended_at)
    : null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={"/projects/" + project.project_code}
          className="text-xs font-medium text-sky-700 hover:underline"
        >
          ← {project.project_code}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          Execution &amp; closure
        </h1>
        <p className="text-sm text-slate-600">{project.title}</p>
      </div>

      {checklist.length === 0 ? (
        <EmptyState
          title="This project has not reached Site Execution yet."
          hint="The checklist is created automatically when the Work Order stage is approved."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardBody>
                <p className="text-2xl font-semibold text-slate-900">{progress?.actualPct ?? 0}%</p>
                <p className="text-xs text-slate-600">Actual progress</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-2xl font-semibold text-slate-900">{progress?.plannedPct ?? 0}%</p>
                <p className="text-xs text-slate-600">Planned progress today</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p
                  className={
                    "text-2xl font-semibold " +
                    ((progress?.variancePct ?? 0) >= 0 ? "text-emerald-700" : "text-red-700")
                  }
                >
                  {(progress?.variancePct ?? 0) >= 0
                    ? "On schedule"
                    : Math.abs(progress?.variancePct ?? 0) + "% behind"}
                </p>
                <p className="text-xs text-slate-600">SPI {progress?.spi ?? 1}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p
                  className={
                    "text-2xl font-semibold " +
                    (compliance?.level === "GREEN"
                      ? "text-emerald-700"
                      : compliance?.level === "AMBER"
                        ? "text-amber-700"
                        : "text-red-700")
                  }
                >
                  {compliance?.missed ?? 0} missed
                </p>
                <p className="text-xs text-slate-600">
                  Weekly reports: {compliance?.submitted ?? 0} of {compliance?.expected ?? 0} due
                </p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Checklist — planned vs actual</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px]">
                  <thead>
                    <tr>
                      <Th>Item</Th>
                      <Th>Weight</Th>
                      <Th>Planned window</Th>
                      <Th>Actual</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {checklist.map((c) => (
                      <tr key={c.id}>
                        <Td className="text-xs">{c.title}</Td>
                        <Td className="text-xs">{c.weight_pct}%</Td>
                        <Td className="text-xs">
                          {formatDate(c.planned_start)} – {formatDate(c.planned_end)}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full bg-sky-700"
                                style={{ width: c.actual_pct + "%" }}
                              />
                            </div>
                            <span className="text-xs">{c.actual_pct}%</span>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Progress reports</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {reports.length === 0 ? (
              <p className="text-xs text-slate-600">No reports submitted yet.</p>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-800">
                    {titleCase(r.report_type)} · {r.progress_pct}% ·{" "}
                    {db.profiles.find((p) => p.id === r.submitted_by)?.full_name ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{r.remarks}</p>
                  {r.issues ? (
                    <p className="mt-1 text-xs text-amber-700">Issue: {r.issues}</p>
                  ) : null}
                  {r.photo_paths.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.photo_paths.map((src) => (
                        <Image
                          key={src}
                          src={src}
                          alt="Site photo"
                          width={96}
                          height={72}
                          unoptimized
                          className="h-18 w-24 rounded border border-slate-200 object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1 text-[11px] text-slate-600">{formatDateTime(r.created_at)}</p>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Submit a report</CardTitle>
          </CardHeader>
          <CardBody>
            {isSite ? (
              <ReportForm projectId={project.id} />
            ) : (
              <p className="text-xs text-slate-600">
                Only the site engineer assigned to this project can submit execution reports.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Running account bills</CardTitle>
            <span className="text-xs text-slate-600">Dues {formatCost(dues)}</span>
          </CardHeader>
          <CardBody className="space-y-3">
            {bills.length === 0 ? (
              <p className="text-xs text-slate-600">No bills submitted yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Bill</Th>
                      <Th>Amount</Th>
                      <Th>Submitted</Th>
                      <Th>Status</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((b) => (
                      <tr key={b.id}>
                        <Td className="text-xs font-medium">{b.bill_no}</Td>
                        <Td className="text-xs">{formatCost(b.amount)}</Td>
                        <Td className="text-xs">{formatDate(b.submitted_at)}</Td>
                        <Td>
                          <Badge className={BILL_TONE[b.status]}>{b.status.toLowerCase()}</Badge>
                        </Td>
                        <Td>
                          {b.status !== "PAID" && (isEe || isFinance) ? (
                            <BillActions
                              billId={b.id}
                              label={b.status === "SUBMITTED" ? "Verify" : "Mark paid"}
                            />
                          ) : null}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isSite ? <RaBillForm projectId={project.id} /> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Extension of time</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {eots.length === 0 ? (
              <p className="text-xs text-slate-600">No extension requested.</p>
            ) : (
              eots.map((e) => (
                <div key={e.id} className="rounded-md border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-800">
                    {e.days_requested} days · {e.status.toLowerCase()}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{e.reason}</p>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Requested {formatDate(e.created_at)}
                    {e.decided_at ? " · decided " + formatDate(e.decided_at) : ""}
                  </p>
                  {e.status === "PENDING" && isEe ? <EotDecision eotId={e.id} /> : null}
                </div>
              ))
            )}
            {isSite && project.current_stage_key === "SITE_EXECUTION" ? (
              <EotForm projectId={project.id} />
            ) : null}
          </CardBody>
        </Card>
      </div>

      {seq >= stageSeq("COMPLETION_REPORT") ? (
        <Card>
          <CardHeader>
            <CardTitle>Completion report</CardTitle>
          </CardHeader>
          <CardBody>
            {completion ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label="Work done" value={completion.work_done_summary} />
                <Detail label="Problems faced" value={completion.problems_faced} />
                <Detail label="Total billed" value={formatCost(completion.total_billed)} />
                <Detail label="Dues" value={formatCost(completion.dues)} />
                <Detail label="Delay" value={completion.delay_days + " days"} />
                <Detail label="Delay reasons" value={completion.delay_reasons} />
                <p className="text-[11px] text-slate-600 sm:col-span-2">
                  Signed by{" "}
                  {db.profiles.find((p) => p.id === completion.signed_by)?.full_name ?? "—"} ·{" "}
                  {formatDateTime(completion.created_at)}
                </p>
              </dl>
            ) : isEe || user.role === "MINISTRY" ? (
              <CompletionReportForm
                projectId={project.id}
                delayDays={attribution.delayDays}
                delayReasons={attribution.reasons.join(" ")}
                totalBilled={attribution.totalBilled}
                dues={attribution.dues}
              />
            ) : (
              <p className="text-xs text-slate-600">
                The Executive Engineer signs the completion report.
              </p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {project.current_stage_key === "FINAL_BILL" ? (
        <Card>
          <CardHeader>
            <CardTitle>Final bill</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-slate-700">
              Outstanding dues: <strong>{formatCost(dues)}</strong> across{" "}
              {bills.filter((b) => b.status !== "PAID").length} bill(s).
            </p>
            {isFinance ? (
              <SettleFinalBillPanel projectId={project.id} disabled={dues === 0} />
            ) : (
              <p className="text-xs text-slate-600">Finance settles the final bill.</p>
            )}
          </CardBody>
        </Card>
      ) : null}

      {project.current_stage_key === "DLP_CLOSURE" ? (
        <Card>
          <CardHeader>
            <CardTitle>Defect liability period</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {project.status === "COMPLETED" ? (
              <Alert tone="success">This project is closed.</Alert>
            ) : (
              <>
                <p className="text-sm text-slate-700">
                  {dlpSla && dlpSla.daysRemaining > 0
                    ? dlpSla.daysRemaining + " days remaining until the defect liability period ends."
                    : "The defect liability period has finished. The project can be closed."}
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-sky-700"
                    style={{ width: Math.min(dlpSla?.pctUsed ?? 0, 100) + "%" }}
                  />
                </div>
                <CloseProjectPanel
                  projectId={project.id}
                  disabled={!dlpSla || dlpSla.daysRemaining > 0 || user.role !== "DEPT_HEAD"}
                />
              </>
            )}
          </CardBody>
        </Card>
      ) : null}

      {executionInstance ? (
        <p className="text-[11px] text-slate-600">
          Site Execution started {formatDate(executionInstance.started_at)} · due{" "}
          {formatDate(executionInstance.due_at)} · SLA {executionInstance.sla_days} days
          {eots.some((e) => e.status === "APPROVED")
            ? " (includes an approved extension of time)"
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}
