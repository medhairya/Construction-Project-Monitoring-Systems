import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getDb } from "@/lib/db/store";
import { STAGE_DEFINITIONS } from "@/lib/domain/stages";
import { Alert, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { ProposalForm } from "./proposal-form";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!can(user, "project.create")) redirect("/dashboard");
  const db = getDb();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Create proposal — Stage 1
        </h1>
        <p className="text-sm text-slate-600">
          The Project ID is generated here and only here (rule R5).
        </p>
      </div>

      <Alert tone="info">
        Format: <code className="font-mono">GJ-&#123;DEPT&#125;-&#123;YYYY&#125;-&#123;DISTRICT&#125;-&#123;SEQ4&#125;</code>,
        e.g. <code className="font-mono">GJ-RB-2026-AHD-0042</code>.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Proposal details</CardTitle>
        </CardHeader>
        <CardBody>
          <ProposalForm
            districts={db.districts}
            stages={STAGE_DEFINITIONS.map((s) => ({
              key: s.key,
              name: s.name,
              seq: s.seq,
              defaultSla: s.default_sla_days,
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
