"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BREACH_CAUSES, DECISION_TYPES, STAGE_KEYS } from "@/lib/domain/types";
import { requireUser, SESSION_COOKIE, verifyCredentials } from "@/lib/auth";
import { resetDb, setClockOffset, shiftClock } from "@/lib/db/store";
import { savePhotos } from "@/lib/uploads";
import {
  RuleError,
  fnAdvanceRaBill,
  fnApproveStage,
  fnCloseProject,
  fnDecideEot,
  fnCloseSubtask,
  fnCreateProject,
  fnForwardFile,
  fnOpenSubtask,
  fnPostChatMessage,
  fnRecordDecision,
  fnRequestEot,
  fnReturnStage,
  fnSettleFinalBill,
  fnSlaSweep,
  fnSubmitCompletionReport,
  fnSubmitExecutionReport,
  fnSubmitJustification,
  fnSubmitRaBill,
} from "@/lib/db/rpc";

export interface ActionState {
  error?: string;
  ok?: string;
  createdCode?: string;
}

function fail(e: unknown): ActionState {
  if (e instanceof RuleError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input." };
  if (e instanceof Error) return { error: e.message };
  return { error: "Something went wrong." };
}

function refresh() {
  revalidatePath("/", "layout");
}

// --- session ------------------------------------------------------------

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const user = verifyCredentials(email, password);
  if (!user) return { error: "Unknown account or wrong password." };
  (await cookies()).set(SESSION_COOKIE, user.id, { httpOnly: true, path: "/", sameSite: "lax" });
  redirect("/dashboard");
}

export async function switchUserAction(userId: string) {
  (await cookies()).set(SESSION_COOKIE, userId, { httpOnly: true, path: "/", sameSite: "lax" });
  refresh();
  redirect("/dashboard");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// --- workflow -----------------------------------------------------------

const createSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters."),
  description: z.string().min(10, "Describe the work in at least 10 characters."),
  district_id: z.string().min(1, "Choose a district."),
  sanctioned_cost: z.coerce.number().positive("Sanctioned cost must be greater than zero."),
});

export async function createProjectAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let code: string;
  try {
    const user = await requireUser();
    const parsed = createSchema.parse({
      title: form.get("title"),
      description: form.get("description"),
      district_id: form.get("district_id"),
      sanctioned_cost: form.get("sanctioned_cost"),
    });
    const overrides: Record<string, number> = {};
    for (const key of STAGE_KEYS) {
      const raw = form.get("sla_" + key);
      if (raw && String(raw).trim() !== "") overrides[key] = Number(raw);
    }
    const project = fnCreateProject({
      actor: user,
      ...parsed,
      sla_overrides: overrides,
    });
    code = project.project_code;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect("/projects/" + code + "?created=1");
}

export async function approveStageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let code: string;
  let completed = false;
  try {
    const user = await requireUser();
    const result = fnApproveStage({
      actor: user,
      project_id: String(form.get("project_id")),
      remark: String(form.get("remark") ?? ""),
    });
    code = result.project.project_code;
    completed = result.completed;
  } catch (e) {
    return fail(e);
  }
  refresh();
  // The approve form unmounts once the stage moves on, so the confirmation is
  // carried to the passport instead of living inside the form.
  redirect("/projects/" + code + "?msg=" + (completed ? "completed" : "approved"));
}

export async function returnStageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let code: string;
  try {
    const user = await requireUser();
    const schema = z.object({
      project_id: z.string().min(1),
      target_stage: z.enum(STAGE_KEYS),
      reason: z.string().min(5, "A reason of at least 5 characters is mandatory."),
    });
    const parsed = schema.parse({
      project_id: form.get("project_id"),
      target_stage: form.get("target_stage"),
      reason: form.get("reason"),
    });
    code = fnReturnStage({ actor: user, ...parsed }).project_code;
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect("/projects/" + code + "?msg=returned");
}

export async function forwardFileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    fnForwardFile({
      actor: user,
      project_id: String(form.get("project_id")),
      to_desk_id: String(form.get("to_desk_id")),
      remark: String(form.get("remark") ?? ""),
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "File forwarded." };
}

export async function openSubtaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    fnOpenSubtask({
      actor: user,
      project_id: String(form.get("project_id")),
      desk_id: String(form.get("desk_id")),
      title: z.string().min(3, "Give the sub-task a title.").parse(form.get("title")),
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Sub-task opened." };
}

export async function closeSubtaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    fnCloseSubtask({ actor: user, subtask_id: String(form.get("subtask_id")) });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Sub-task closed." };
}

// --- escalation ---------------------------------------------------------

export async function submitJustificationAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      escalation_id: z.string().min(1),
      cause: z.enum(BREACH_CAUSES),
      explanation: z.string().min(20, "Explain the cause in at least 20 characters."),
      impact: z.string().min(10, "State the impact."),
      proposed_fix: z.string().min(10, "State the proposed fix."),
      new_eta: z.string().min(4, "Give a new ETA."),
    });
    const parsed = schema.parse({
      escalation_id: form.get("escalation_id"),
      cause: form.get("cause"),
      explanation: form.get("explanation"),
      impact: form.get("impact"),
      proposed_fix: form.get("proposed_fix"),
      new_eta: form.get("new_eta"),
    });
    fnSubmitJustification({ actor: user, ...parsed });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Justification submitted to the Ministry." };
}

export async function postChatMessageAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const body = z.string().min(1, "Message cannot be empty.").parse(form.get("body"));
    fnPostChatMessage({
      actor: user,
      escalation_id: String(form.get("escalation_id")),
      body,
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Message logged." };
}

export async function recordDecisionAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      escalation_id: z.string().min(1),
      decision_type: z.enum(DECISION_TYPES),
      changes_ordered: z.string().min(10, "State the changes ordered."),
      reason: z.string().min(10, "State the reason for the decision."),
      new_sla_days: z.coerce.number().int().positive("New SLA must be a positive number of days."),
      reentry_stage_key: z.enum(STAGE_KEYS),
      priority: z.enum(["NORMAL", "HIGH"]),
    });
    const parsed = schema.parse({
      escalation_id: form.get("escalation_id"),
      decision_type: form.get("decision_type"),
      changes_ordered: form.get("changes_ordered"),
      reason: form.get("reason"),
      new_sla_days: form.get("new_sla_days"),
      reentry_stage_key: form.get("reentry_stage_key"),
      priority: form.get("priority"),
    });
    fnRecordDecision({ actor: user, ...parsed });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Decision recorded. The project has re-entered the flow." };
}

// --- execution ----------------------------------------------------------

export async function submitExecutionReportAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let photoCount = 0;
  try {
    const user = await requireUser();
    const schema = z.object({
      project_id: z.string().min(1),
      report_type: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
      progress_pct: z.coerce.number().min(0).max(100),
      remarks: z.string().min(5, "Add a remark."),
      issues: z.string().optional().default(""),
    });
    const parsed = schema.parse({
      project_id: form.get("project_id"),
      report_type: form.get("report_type"),
      progress_pct: form.get("progress_pct"),
      remarks: form.get("remarks"),
      issues: form.get("issues") ?? "",
    });
    const photos = await savePhotos(
      parsed.project_id,
      form.getAll("photos").filter((f): f is File => f instanceof File),
    );
    photoCount = photos.length;
    fnSubmitExecutionReport({ actor: user, ...parsed, photo_paths: photos });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return {
    ok:
      "Report submitted" +
      (photoCount > 0 ? " with " + photoCount + " photo(s)" : "") +
      ". Progress updated on the passport.",
  };
}

export async function submitRaBillAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      project_id: z.string().min(1),
      bill_no: z.string().min(1, "Give the bill a number."),
      amount: z.coerce.number().positive("Amount must be greater than zero."),
    });
    fnSubmitRaBill({
      actor: user,
      ...schema.parse({
        project_id: form.get("project_id"),
        bill_no: form.get("bill_no"),
        amount: form.get("amount"),
      }),
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Running account bill submitted." };
}

export async function advanceRaBillAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    fnAdvanceRaBill({ actor: user, bill_id: String(form.get("bill_id")) });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Bill updated." };
}

export async function requestEotAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      project_id: z.string().min(1),
      days_requested: z.coerce.number().int().positive("Days must be a positive number."),
      reason: z.string().min(10, "Give a reason of at least 10 characters."),
    });
    fnRequestEot({
      actor: user,
      ...schema.parse({
        project_id: form.get("project_id"),
        days_requested: form.get("days_requested"),
        reason: form.get("reason"),
      }),
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Extension of time requested." };
}

export async function decideEotAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let approved = false;
  try {
    const user = await requireUser();
    approved = form.get("approve") === "1";
    fnDecideEot({ actor: user, eot_id: String(form.get("eot_id")), approve: approved });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return {
    ok: approved
      ? "Extension approved. The Site Execution due date has been extended and logged."
      : "Extension rejected.",
  };
}

export async function submitCompletionReportAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const schema = z.object({
      project_id: z.string().min(1),
      work_done_summary: z.string().min(20, "Summarise the work in at least 20 characters."),
      total_billed: z.coerce.number().min(0),
      dues: z.coerce.number().min(0),
      problems_faced: z.string().min(5, "State the problems faced."),
      delay_days: z.coerce.number().min(0),
      delay_reasons: z.string().min(5, "State the delay reasons."),
    });
    fnSubmitCompletionReport({
      actor: user,
      ...schema.parse({
        project_id: form.get("project_id"),
        work_done_summary: form.get("work_done_summary"),
        total_billed: form.get("total_billed"),
        dues: form.get("dues"),
        problems_faced: form.get("problems_faced"),
        delay_days: form.get("delay_days"),
        delay_reasons: form.get("delay_reasons"),
      }),
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Completion report signed and placed on record." };
}

export async function settleFinalBillAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    fnSettleFinalBill({ actor: user, project_id: String(form.get("project_id")) });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Final bill settled. All dues cleared." };
}

export async function closeProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    fnCloseProject({ actor: user, project_id: String(form.get("project_id")) });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: "Project closed." };
}

// --- admin / demo clock -------------------------------------------------

export async function shiftClockAction(days: number) {
  await requireUser();
  shiftClock(days);
  fnSlaSweep();
  refresh();
}

export async function resetClockAction() {
  await requireUser();
  setClockOffset(0);
  refresh();
}

export async function resetSeedAction() {
  await requireUser();
  resetDb();
  refresh();
  redirect("/dashboard");
}

export async function runSweepAction() {
  await requireUser();
  const result = fnSlaSweep();
  refresh();
  return result;
}
