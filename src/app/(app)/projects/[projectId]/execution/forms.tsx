"use client";

import { Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import {
  advanceRaBillAction,
  closeProjectAction,
  decideEotAction,
  requestEotAction,
  settleFinalBillAction,
  submitCompletionReportAction,
  submitExecutionReportAction,
  submitRaBillAction,
} from "@/lib/actions";

export function ReportForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={submitExecutionReportAction}>
      <input type="hidden" name="project_id" value={projectId} />
      <Field label="Report type">
        <Select name="report_type" defaultValue="WEEKLY">
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
        </Select>
      </Field>
      <Field label="Progress %" hint="This updates the checklist and the passport.">
        <Input name="progress_pct" type="number" min={0} max={100} defaultValue={0} required />
      </Field>
      <Field label="Remarks">
        <Textarea name="remarks" rows={3} required placeholder="Work carried out this week…" />
      </Field>
      <Field label="Issues (optional)">
        <Textarea name="issues" rows={2} placeholder="Material supply, weather, labour…" />
      </Field>
      <Field label="Site photos" hint="JPEG, PNG or WebP, up to 5 MB each.">
        <input
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
      </Field>
      <SubmitButton>Submit report</SubmitButton>
    </ActionForm>
  );
}

export function RaBillForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={submitRaBillAction} className="border-t border-slate-100 pt-3">
      <input type="hidden" name="project_id" value={projectId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input name="bill_no" placeholder="Bill no. e.g. RA-04" required />
        <Input name="amount" type="number" min={1} placeholder="Amount in ₹" required />
        <SubmitButton variant="secondary">Submit bill</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function BillActions({ billId, label }: { billId: string; label: string }) {
  return (
    <ActionForm action={advanceRaBillAction} hideMessages>
      <input type="hidden" name="bill_id" value={billId} />
      <SubmitButton size="sm" variant="secondary">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

export function EotForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm action={requestEotAction} className="border-t border-slate-100 pt-3">
      <input type="hidden" name="project_id" value={projectId} />
      <Field label="Days requested">
        <Input name="days_requested" type="number" min={1} defaultValue={30} required />
      </Field>
      <Field label="Reason">
        <Textarea name="reason" rows={2} required placeholder="Monsoon stoppage, redesign…" />
      </Field>
      <SubmitButton variant="secondary">Request extension</SubmitButton>
    </ActionForm>
  );
}

export function EotDecision({ eotId }: { eotId: string }) {
  return (
    <div className="mt-2 flex gap-2">
      <ActionForm action={decideEotAction} hideMessages>
        <input type="hidden" name="eot_id" value={eotId} />
        <input type="hidden" name="approve" value="1" />
        <SubmitButton size="sm">Approve</SubmitButton>
      </ActionForm>
      <ActionForm action={decideEotAction} hideMessages>
        <input type="hidden" name="eot_id" value={eotId} />
        <input type="hidden" name="approve" value="0" />
        <SubmitButton size="sm" variant="secondary">
          Reject
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

export function CompletionReportForm({
  projectId,
  delayDays,
  delayReasons,
  totalBilled,
  dues,
}: {
  projectId: string;
  delayDays: number;
  delayReasons: string;
  totalBilled: number;
  dues: number;
}) {
  return (
    <ActionForm action={submitCompletionReportAction}>
      <input type="hidden" name="project_id" value={projectId} />
      <Field label="Work done summary">
        <Textarea name="work_done_summary" rows={3} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Total billed (₹)">
          <Input name="total_billed" type="number" min={0} defaultValue={totalBilled} required />
        </Field>
        <Field label="Dues (₹)">
          <Input name="dues" type="number" min={0} defaultValue={dues} required />
        </Field>
      </div>
      <Field label="Problems faced">
        <Textarea name="problems_faced" rows={2} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Delay days (auto)">
          <Input name="delay_days" type="number" min={0} defaultValue={delayDays} required />
        </Field>
        <div className="sm:col-span-3">
          <Field
            label="Delay reasons (auto-filled from SLA overruns, escalations and EoT)"
          >
            <Textarea name="delay_reasons" rows={2} defaultValue={delayReasons} required />
          </Field>
        </div>
      </div>
      <SubmitButton>Sign completion report</SubmitButton>
    </ActionForm>
  );
}

export function SettleFinalBillPanel({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled: boolean;
}) {
  return (
    <ActionForm action={settleFinalBillAction}>
      <input type="hidden" name="project_id" value={projectId} />
      <SubmitButton disabled={disabled}>
        {disabled ? "No dues outstanding" : "Mark final bill settled"}
      </SubmitButton>
    </ActionForm>
  );
}

export function CloseProjectPanel({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled: boolean;
}) {
  return (
    <ActionForm action={closeProjectAction}>
      <input type="hidden" name="project_id" value={projectId} />
      <SubmitButton disabled={disabled}>Close project</SubmitButton>
    </ActionForm>
  );
}
