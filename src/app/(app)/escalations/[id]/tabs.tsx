"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import {
  postChatMessageAction,
  recordDecisionAction,
  submitJustificationAction,
} from "@/lib/actions";
import { BREACH_CAUSES, DECISION_TYPES } from "@/lib/domain/types";
import { formatDateTime, titleCase } from "@/lib/utils";

interface JustificationView {
  cause: string;
  explanation: string;
  impact: string;
  proposed_fix: string;
  new_eta: string;
  created_at: string;
  submitterName: string;
}

interface MessageView {
  id: string;
  body: string;
  created_at: string;
  senderName: string;
  senderRole: string;
  mine: boolean;
}

interface DecisionView {
  decision_type: string;
  changes_ordered: string;
  reason: string;
  new_sla_days: number;
  priority: string;
  created_at: string;
  deciderName: string;
  reentryStageName: string;
}

export function EscalationTabs(props: {
  escalationId: string;
  status: string;
  canJustify: boolean;
  isMinistry: boolean;
  currentUserId: string;
  justification: JustificationView | null;
  messages: MessageView[];
  decision: DecisionView | null;
  reentryStages: { key: string; name: string }[];
  defaultSla: number;
}) {
  const [tab, setTab] = useState<"justification" | "chat" | "decision">(
    props.justification ? (props.decision ? "decision" : "chat") : "justification",
  );
  const router = useRouter();

  // Stand-in for Supabase Realtime: refresh the thread while the chat is open.
  useEffect(() => {
    if (tab !== "chat") return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [tab, router]);

  const tabs = [
    { key: "justification" as const, label: "1 · Justification" },
    { key: "chat" as const, label: "2 · Official chat" },
    { key: "decision" as const, label: "3 · Decision" },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant={tab === t.key ? "primary" : "secondary"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </CardHeader>

      <CardBody>
        {tab === "justification" ? (
          props.justification ? (
            <dl className="space-y-3 text-sm">
              <Row label="Cause" value={titleCase(props.justification.cause)} />
              <Row label="Explanation" value={props.justification.explanation} />
              <Row label="Impact" value={props.justification.impact} />
              <Row label="Proposed fix" value={props.justification.proposed_fix} />
              <Row label="New ETA" value={props.justification.new_eta} />
              <p className="text-[11px] text-slate-600">
                Submitted by {props.justification.submitterName} ·{" "}
                {formatDateTime(props.justification.created_at)}
              </p>
            </dl>
          ) : props.canJustify ? (
            <ActionForm action={submitJustificationAction}>
              <input type="hidden" name="escalation_id" value={props.escalationId} />
              <Field label="Cause category">
                <Select name="cause" required>
                  {BREACH_CAUSES.map((c) => (
                    <option key={c} value={c}>
                      {titleCase(c)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Detailed explanation" hint="At least 20 characters. This goes on record.">
                <Textarea name="explanation" rows={3} required />
              </Field>
              <Field label="Impact">
                <Textarea name="impact" rows={2} required />
              </Field>
              <Field label="Proposed fix">
                <Textarea name="proposed_fix" rows={2} required />
              </Field>
              <Field label="New ETA">
                <Input name="new_eta" type="date" required />
              </Field>
              <SubmitButton>Submit to the Ministry</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-xs text-slate-600">
              Waiting for the holding officer to submit their justification.
            </p>
          )
        ) : null}

        {tab === "chat" ? (
          <div className="space-y-4">
            <Alert tone="warning">
              <span className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" />
                Every message is logged permanently and cannot be edited or deleted.
              </span>
            </Alert>
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {props.messages.length === 0 ? (
                <p className="text-xs text-slate-600">No messages yet.</p>
              ) : (
                props.messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      "rounded-md border px-3 py-2 " +
                      (m.mine ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-white")
                    }
                  >
                    <p className="text-[11px] font-semibold text-slate-700">
                      {m.senderName}{" "}
                      <span className="rounded bg-slate-100 px-1 font-normal text-slate-600">
                        {m.senderRole}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-800">{m.body}</p>
                    <p className="mt-1 text-[10px] text-slate-600">{formatDateTime(m.created_at)}</p>
                  </div>
                ))
              )}
            </div>
            <ActionForm action={postChatMessageAction}>
              <input type="hidden" name="escalation_id" value={props.escalationId} />
              <Field label="Message">
                <Textarea name="body" rows={2} required placeholder="Type your message…" />
              </Field>
              <SubmitButton>Post to the official record</SubmitButton>
            </ActionForm>
          </div>
        ) : null}

        {tab === "decision" ? (
          props.decision ? (
            <dl className="space-y-3 text-sm">
              <Row label="Decision" value={titleCase(props.decision.decision_type)} />
              <Row label="Changes ordered" value={props.decision.changes_ordered} />
              <Row label="Reason" value={props.decision.reason} />
              <Row label="New SLA" value={props.decision.new_sla_days + " days"} />
              <Row label="Re-entry stage" value={props.decision.reentryStageName} />
              <Row label="Priority" value={props.decision.priority} />
              <p className="text-[11px] text-slate-600">
                Decided by {props.decision.deciderName} · {formatDateTime(props.decision.created_at)}{" "}
                · append-only
              </p>
            </dl>
          ) : props.isMinistry ? (
            <ActionForm action={recordDecisionAction}>
              <input type="hidden" name="escalation_id" value={props.escalationId} />
              <Field label="Decision type">
                <Select name="decision_type" required defaultValue="ORDER_CHANGES">
                  {DECISION_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {titleCase(d)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Changes ordered">
                <Textarea name="changes_ordered" rows={2} required />
              </Field>
              <Field label="Reason">
                <Textarea name="reason" rows={2} required />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="New SLA (days)">
                  <Input
                    name="new_sla_days"
                    type="number"
                    min={1}
                    defaultValue={props.defaultSla}
                    required
                  />
                </Field>
                <Field label="Re-entry stage">
                  <Select
                    name="reentry_stage_key"
                    required
                    defaultValue={props.reentryStages[props.reentryStages.length - 1]?.key}
                  >
                    {props.reentryStages.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select name="priority" defaultValue="HIGH" required>
                    <option value="HIGH">High</option>
                    <option value="NORMAL">Normal</option>
                  </Select>
                </Field>
              </div>
              <SubmitButton>Record decision &amp; re-enter the file</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-xs text-slate-600">
              Only the Ministry can record the decision on an escalation.
            </p>
          )
        ) : null}
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}
