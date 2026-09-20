"use client";

import { useState } from "react";
import { ArrowRight, CornerUpLeft, Send } from "lucide-react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import {
  approveStageAction,
  closeSubtaskAction,
  forwardFileAction,
  openSubtaskAction,
  returnStageAction,
} from "@/lib/actions";
import { stageName } from "@/lib/domain/stages";
import type { StageKey, Subtask } from "@/lib/domain/types";

export interface ActionBarProps {
  projectId: string;
  approve: { allowed: boolean; reason?: string };
  forward: { allowed: boolean; reason?: string };
  returnTargets: StageKey[];
  desks: { id: string; designation: string; officer_name: string }[];
  subtasks: Subtask[];
  deskNameById: Record<string, string>;
  nextStageName: string | null;
}

export function ActionBar(props: ActionBarProps) {
  const [tab, setTab] = useState<"approve" | "return" | "forward" | "subtask">(
    props.approve.allowed ? "approve" : props.forward.allowed ? "forward" : "approve",
  );

  const tabs = [
    { key: "approve" as const, label: "Approve", icon: ArrowRight, enabled: props.approve.allowed },
    { key: "return" as const, label: "Return", icon: CornerUpLeft, enabled: props.approve.allowed && props.returnTargets.length > 0 },
    { key: "forward" as const, label: "Forward", icon: Send, enabled: props.forward.allowed },
    { key: "subtask" as const, label: "Sub-tasks", icon: Send, enabled: props.forward.allowed || props.approve.allowed },
  ];

  const blocked = !props.approve.allowed && !props.forward.allowed;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions on this file</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {blocked ? (
          <Alert tone="warning">
            {props.approve.reason ?? props.forward.reason ?? "You have no actions on this file."}
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? "primary" : "secondary"}
              disabled={!t.enabled}
              title={t.enabled ? undefined : props.approve.reason ?? props.forward.reason}
              onClick={() => setTab(t.key)}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </Button>
          ))}
        </div>

        {tab === "approve" && props.approve.allowed ? (
          <ActionForm action={approveStageAction}>
            <input type="hidden" name="project_id" value={props.projectId} />
            <Field
              label="Approval remark"
              hint={
                props.nextStageName
                  ? "On approval the file moves to " + props.nextStageName + "."
                  : "This is the last stage — approving closes the project."
              }
            >
              <Textarea name="remark" rows={2} placeholder="Sanction accorded as per the estimate." />
            </Field>
            <SubmitButton>Approve stage</SubmitButton>
          </ActionForm>
        ) : null}

        {tab === "return" && props.approve.allowed ? (
          <ActionForm action={returnStageAction}>
            <input type="hidden" name="project_id" value={props.projectId} />
            <Field label="Return to stage">
              <Select name="target_stage" required>
                {props.returnTargets.map((s) => (
                  <option key={s} value={s}>
                    {stageName(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason (mandatory)" hint="The target stage gets a new instance and its SLA restarts (R4).">
              <Textarea name="reason" rows={2} required placeholder="Estimate uses old SOR rates." />
            </Field>
            <SubmitButton variant="danger">Return file</SubmitButton>
          </ActionForm>
        ) : null}

        {tab === "forward" && props.forward.allowed ? (
          <ActionForm action={forwardFileAction}>
            <input type="hidden" name="project_id" value={props.projectId} />
            <Field label="Forward to desk (inside your department)">
              <Select name="to_desk_id" required>
                {props.desks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.designation} — {d.officer_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Remark">
              <Input name="remark" placeholder="Forwarded for scrutiny." />
            </Field>
            <SubmitButton>Forward file</SubmitButton>
          </ActionForm>
        ) : null}

        {tab === "subtask" ? (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-600">
                Open sub-tasks in this stage (R2 — the stage cannot advance until all are closed)
              </p>
              {props.subtasks.length === 0 ? (
                <p className="text-xs text-slate-600">No sub-tasks in this stage.</p>
              ) : (
                <ul className="space-y-2">
                  {props.subtasks.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                    >
                      <span className="text-xs text-slate-700">
                        {s.title} · {props.deskNameById[s.desk_id] ?? "—"} ·{" "}
                        <span className={s.status === "OPEN" ? "text-amber-700" : "text-emerald-700"}>
                          {s.status.toLowerCase()}
                        </span>
                      </span>
                      {s.status === "OPEN" ? (
                        <ActionForm action={closeSubtaskAction} hideMessages>
                          <input type="hidden" name="subtask_id" value={s.id} />
                          <SubmitButton size="sm" variant="secondary">
                            Close
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <ActionForm action={openSubtaskAction}>
              <input type="hidden" name="project_id" value={props.projectId} />
              <div className="grid gap-2 sm:grid-cols-3">
                <Input name="title" placeholder="Sub-task title" required />
                <Select name="desk_id" required>
                  {props.desks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.designation}
                    </option>
                  ))}
                </Select>
                <SubmitButton variant="secondary">Open sub-task</SubmitButton>
              </div>
            </ActionForm>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
