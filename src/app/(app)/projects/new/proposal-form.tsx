"use client";

import { Field, Input, Select, Textarea } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { createProjectAction } from "@/lib/actions";

export function ProposalForm({
  districts,
  stages,
}: {
  districts: { id: string; name: string }[];
  stages: { key: string; name: string; seq: number; defaultSla: number }[];
}) {
  return (
    <ActionForm action={createProjectAction}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Field label="Project title">
            <Input name="title" required placeholder="Four-lane road, Sanand–Bavla" />
          </Field>
          <Field label="District">
            <Select name="district_id" required>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sanctioned cost (₹)" hint="Enter the full amount in rupees.">
            <Input name="sanctioned_cost" type="number" min={1} required defaultValue={100000000} />
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={4} required placeholder="Scope of the work…" />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-slate-600">
            SLA overrides (days) — leave blank to use the default
          </p>
          <div className="grid grid-cols-2 gap-2">
            {stages.map((s) => (
              <div key={s.key}>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-600">
                    {s.seq}. {s.name}
                  </span>
                  <Input
                    name={"sla_" + s.key}
                    type="number"
                    min={1}
                    placeholder={String(s.defaultSla)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <SubmitButton>Create proposal &amp; generate Project ID</SubmitButton>
      </div>
    </ActionForm>
  );
}
