import { STAGE_BY_KEY, STAGE_DEFINITIONS, stageSeq } from "@/lib/domain/stages";
import { addDays } from "@/lib/sla";
import type {
  ChatMessage,
  ChatThread,
  CompletionReport,
  Database,
  Decision,
  EotRequest,
  RaBill,
  Department,
  Desk,
  District,
  Escalation,
  ExecutionChecklistItem,
  ExecutionReport,
  FileMovement,
  Justification,
  Profile,
  Project,
  StageInstance,
  StageKey,
  Subtask,
} from "@/lib/domain/types";

export const DEMO_PASSWORD = "Demo@1234";

const departments: Department[] = [
  { id: "d-min", code: "MIN", name: "Ministry (CMO)" },
  { id: "d-fin", code: "FIN", name: "Finance Department" },
  { id: "d-rb", code: "RB", name: "Roads & Buildings (PWD)" },
  { id: "d-tnd", code: "TND", name: "Tender Cell" },
  { id: "d-site", code: "SITE", name: "Site Execution Wing" },
];

const desks: Desk[] = [
  { id: "dk-min-so", department_id: "d-min", designation: "Section Officer (CMO)", officer_name: "R. Mehta", phone: "079-2325-1101", email: "so.cmo@gujarat.gov.in" },
  { id: "dk-min-ds", department_id: "d-min", designation: "Deputy Secretary (CMO)", officer_name: "A. Bhatt", phone: "079-2325-1102", email: "ds.cmo@gujarat.gov.in" },
  { id: "dk-fin-so", department_id: "d-fin", designation: "Section Officer (Finance)", officer_name: "K. Patel", phone: "079-2325-2201", email: "so.fin@gujarat.gov.in" },
  { id: "dk-fin-ao", department_id: "d-fin", designation: "Accounts Officer", officer_name: "S. Desai", phone: "079-2325-2202", email: "ao.fin@gujarat.gov.in" },
  { id: "dk-fin-plan", department_id: "d-fin", designation: "Planning Officer", officer_name: "M. Joshi", phone: "079-2325-2203", email: "plan.fin@gujarat.gov.in" },
  { id: "dk-fin-ds", department_id: "d-fin", designation: "Deputy Secretary (Finance)", officer_name: "P. Shah", phone: "079-2325-2204", email: "ds.fin@gujarat.gov.in" },
  { id: "dk-fin-sec", department_id: "d-fin", designation: "Secretary (Finance)", officer_name: "V. Trivedi", phone: "079-2325-2205", email: "sec.fin@gujarat.gov.in" },
  { id: "dk-rb-je", department_id: "d-rb", designation: "Junior Engineer", officer_name: "H. Solanki", phone: "079-2325-3301", email: "je.rb@gujarat.gov.in" },
  { id: "dk-rb-de", department_id: "d-rb", designation: "Deputy Engineer", officer_name: "N. Chauhan", phone: "079-2325-3302", email: "de.rb@gujarat.gov.in" },
  { id: "dk-rb-ee", department_id: "d-rb", designation: "Executive Engineer", officer_name: "D. Rathod", phone: "079-2325-3303", email: "ee.rb@gujarat.gov.in" },
  { id: "dk-rb-se", department_id: "d-rb", designation: "Superintending Engineer", officer_name: "J. Vyas", phone: "079-2325-3304", email: "se.rb@gujarat.gov.in" },
  { id: "dk-rb-ce", department_id: "d-rb", designation: "Chief Engineer", officer_name: "B. Parmar", phone: "079-2325-3305", email: "ce.rb@gujarat.gov.in" },
  { id: "dk-tnd-clerk", department_id: "d-tnd", designation: "Tender Clerk", officer_name: "F. Qureshi", phone: "079-2325-4401", email: "clerk.tnd@gujarat.gov.in" },
  { id: "dk-tnd-off", department_id: "d-tnd", designation: "Tender Officer", officer_name: "L. Pandya", phone: "079-2325-4402", email: "officer.tnd@gujarat.gov.in" },
  { id: "dk-site-je", department_id: "d-site", designation: "Site Engineer", officer_name: "T. Makwana", phone: "079-2325-5501", email: "site.eng@gujarat.gov.in" },
  { id: "dk-site-ee", department_id: "d-site", designation: "EE (Site Wing)", officer_name: "G. Thakkar", phone: "079-2325-5502", email: "ee.site@gujarat.gov.in" },
];

const profiles: Profile[] = [
  { id: "u-ministry", email: "ministry@demo", full_name: "A. Bhatt", role: "MINISTRY", department_id: "d-min", desk_id: "dk-min-ds" },
  { id: "u-fin-head", email: "finance.head@demo", full_name: "V. Trivedi", role: "DEPT_HEAD", department_id: "d-fin", desk_id: "dk-fin-sec" },
  { id: "u-fin-op", email: "finance.op@demo", full_name: "K. Patel", role: "DEPT_OPERATOR", department_id: "d-fin", desk_id: "dk-fin-so" },
  { id: "u-rb-head", email: "rb.head@demo", full_name: "B. Parmar", role: "DEPT_HEAD", department_id: "d-rb", desk_id: "dk-rb-ce" },
  { id: "u-rb-op", email: "rb.op@demo", full_name: "N. Chauhan", role: "DEPT_OPERATOR", department_id: "d-rb", desk_id: "dk-rb-de" },
  { id: "u-tnd-head", email: "tender.head@demo", full_name: "L. Pandya", role: "DEPT_HEAD", department_id: "d-tnd", desk_id: "dk-tnd-off" },
  { id: "u-site-head", email: "site.head@demo", full_name: "G. Thakkar", role: "DEPT_HEAD", department_id: "d-site", desk_id: "dk-site-ee" },
  { id: "u-site-eng", email: "site.eng@demo", full_name: "T. Makwana", role: "SITE_ENGINEER", department_id: "d-site", desk_id: "dk-site-je" },
  { id: "u-admin", email: "admin@demo", full_name: "System Administrator", role: "SUPER_ADMIN", department_id: null, desk_id: null },
];

const districts: District[] = [
  { id: "dist-ahd", code: "AHD", name: "Ahmedabad" },
  { id: "dist-vad", code: "VAD", name: "Vadodara" },
  { id: "dist-srt", code: "SRT", name: "Surat" },
];

// Head desk and working desks per department, used to place the file.
const HEAD_DESK: Record<string, string> = {
  d_min: "dk-min-ds",
  "d-min": "dk-min-ds",
  "d-fin": "dk-fin-sec",
  "d-rb": "dk-rb-ce",
  "d-tnd": "dk-tnd-off",
  "d-site": "dk-site-ee",
};

const HEAD_USER: Record<string, string> = {
  "d-min": "u-ministry",
  "d-fin": "u-fin-head",
  "d-rb": "u-rb-head",
  "d-tnd": "u-tnd-head",
  "d-site": "u-site-head",
};

function deptIdOf(stage: StageKey): string {
  const code = STAGE_BY_KEY[stage].owner_department_code;
  return departments.find((d) => d.code === code)!.id;
}

function desksOf(deptId: string): Desk[] {
  return desks.filter((d) => d.department_id === deptId);
}

interface Loop {
  /** The stage that sent the file back. */
  from: StageKey;
  /** Where it went back to. */
  to: StageKey;
  reason: string;
}

interface ProjectSpec {
  code_seq: number;
  title: string;
  district: string;
  cost: number;
  description: string;
  stage: StageKey;
  /** Days the file has already spent in the current stage. */
  daysIn: number;
  /** Fraction of the SLA each completed stage consumed. */
  pastPace?: number;
  priority?: "NORMAL" | "HIGH";
  status?: Project["status"];
  loops?: Loop[];
  escalation?: "AWAITING_JUSTIFICATION" | "UNDER_REVIEW";
  reentered?: { reason: string; changes: string; newSla: number };
  execution?: boolean;
  slaOverrides?: Partial<Record<StageKey, number>>;
  deptCodeForId?: string;
}

const SPECS: ProjectSpec[] = [
  // --- 3 clearly on track -------------------------------------------------
  { code_seq: 1, title: "Four-lane road, Sanand–Bavla", district: "dist-ahd", cost: 184_00_00_000, description: "Widening of SH-17 between Sanand and Bavla to four lanes, including two minor bridges.", stage: "ADMIN_APPROVAL", daysIn: 4, pastPace: 0.5 },
  { code_seq: 2, title: "District Court building, Vadodara", district: "dist-vad", cost: 62_00_00_000, description: "New G+4 district court complex with 12 court rooms and parking.", stage: "TECH_SANCTION", daysIn: 5, pastPace: 0.55 },
  { code_seq: 3, title: "Primary Health Centre, Olpad", district: "dist-srt", cost: 9_50_00_000, description: "30-bed PHC with staff quarters and an ambulance bay.", stage: "MINISTRY_PROPOSAL", daysIn: 2, pastPace: 0.5 },

  // --- 3 at or past 75% of their SLA (amber) ------------------------------
  { code_seq: 4, title: "Flyover at Chandkheda junction", district: "dist-ahd", cost: 240_00_00_000, description: "Six-lane flyover, 1.2 km, over the Chandkheda–Motera junction.", stage: "TENDER", daysIn: 38, pastPace: 0.7 },
  { code_seq: 5, title: "Govt. Polytechnic hostel block, Surat", district: "dist-srt", cost: 31_00_00_000, description: "200-bed hostel block with mess and utilities.", stage: "ADMIN_APPROVAL", daysIn: 17, pastPace: 0.65 },
  { code_seq: 6, title: "Storm water drain, Karelibaug", district: "dist-vad", cost: 44_00_00_000, description: "4.6 km RCC storm water drain with three outfall chambers.", stage: "TECH_SANCTION", daysIn: 17, pastPace: 0.6 },

  // --- 2 breached / escalated --------------------------------------------
  { code_seq: 7, title: "Bridge over Vishwamitri river", district: "dist-vad", cost: 96_00_00_000, description: "Replacement of the existing two-lane bridge with a four-lane structure.", stage: "TECH_SANCTION", daysIn: 27, pastPace: 0.8, status: "ESCALATED", escalation: "AWAITING_JUSTIFICATION" },
  { code_seq: 8, title: "Rural road package RP-14, Surat", district: "dist-srt", cost: 28_00_00_000, description: "Upgrading 42 km of village roads under the rural connectivity package.", stage: "ADMIN_APPROVAL", daysIn: 29, pastPace: 0.75, status: "ESCALATED", escalation: "UNDER_REVIEW" },

  // --- 2 with a return loop in their history ------------------------------
  { code_seq: 9, title: "ITI workshop building, Bharuch", district: "dist-srt", cost: 18_00_00_000, description: "New workshop block with machine foundations for the ITI campus.", stage: "TECH_SANCTION", daysIn: 6, pastPace: 0.6, loops: [{ from: "TECH_SANCTION", to: "ADMIN_APPROVAL", reason: "Estimate uses old SOR rates; revise with SOR 2025 and resubmit." }] },
  { code_seq: 10, title: "Anganwadi cluster, Dholka taluka", district: "dist-ahd", cost: 7_20_00_000, description: "24 anganwadi centres across Dholka taluka.", stage: "TENDER", daysIn: 12, pastPace: 0.6, loops: [{ from: "TENDER", to: "TECH_SANCTION", reason: "Tender schedule does not match the sanctioned drawings." }] },

  // --- 1 HIGH priority, re-entered after a Ministry decision --------------
  { code_seq: 11, title: "Approach road to GIFT City gate 3", district: "dist-ahd", cost: 54_00_00_000, description: "1.8 km approach road with service ducts and street lighting.", stage: "TECH_SANCTION", daysIn: 3, pastPace: 0.9, priority: "HIGH", reentered: { reason: "Delay caused by a pending land clearance that is now resolved. Work must restart immediately.", changes: "Technical Sanction to be completed within the revised SLA. Weekly progress note to the Ministry.", newSla: 10 } },

  // --- 2 in Site Execution with reports -----------------------------------
  { code_seq: 12, title: "Widening of Kamrej–Kim road", district: "dist-srt", cost: 132_00_00_000, description: "Widening 18 km of the Kamrej–Kim corridor to four lanes.", stage: "SITE_EXECUTION", daysIn: 148, pastPace: 0.6, execution: true },
  { code_seq: 13, title: "Sub-district hospital, Nadiad", district: "dist-vad", cost: 88_00_00_000, description: "100-bed sub-district hospital, G+3, with an OT block.", stage: "SITE_EXECUTION", daysIn: 96, pastPace: 0.65, execution: true, slaOverrides: { SITE_EXECUTION: 240 } },

  // --- later stages + 1 completed -----------------------------------------
  { code_seq: 14, title: "Government school block, Daskroi", district: "dist-ahd", cost: 12_40_00_000, description: "12-classroom school block with a library and toilets.", stage: "FINAL_BILL", daysIn: 9, pastPace: 0.6 },
  { code_seq: 15, title: "Bus terminus modernisation, Surat", district: "dist-srt", cost: 74_00_00_000, description: "Modernisation of the city bus terminus including passenger amenities.", stage: "DLP_CLOSURE", daysIn: 40, pastPace: 0.55, status: "COMPLETED" },
];

interface Ctx {
  stage_instances: StageInstance[];
  file_movements: FileMovement[];
  subtasks: Subtask[];
  escalations: Escalation[];
  justifications: Justification[];
  chat_threads: ChatThread[];
  chat_messages: ChatMessage[];
  decisions: Decision[];
  checklist: ExecutionChecklistItem[];
  reports: ExecutionReport[];
  bills: RaBill[];
  eots: EotRequest[];
  completions: CompletionReport[];
}

/** The ordered list of stage visits that produces the requested history. */
function visitPlan(spec: ProjectSpec): StageKey[] {
  const target = stageSeq(spec.stage);
  const plan: StageKey[] = [];
  for (const def of STAGE_DEFINITIONS) {
    if (def.seq > target) break;
    plan.push(def.key);
    for (const loop of spec.loops ?? []) {
      if (def.key === loop.from && stageSeq(loop.from) < target) {
        // Visited, bounced back, and walked forward again.
        for (let s = stageSeq(loop.to); s <= stageSeq(loop.from); s++) {
          plan.push(STAGE_DEFINITIONS[s - 1].key);
        }
      }
    }
  }
  // A loop whose origin is the current stage: ... to -> ... -> from(current)
  for (const loop of spec.loops ?? []) {
    if (stageSeq(loop.from) === target) {
      for (let s = stageSeq(loop.to); s <= target; s++) {
        plan.push(STAGE_DEFINITIONS[s - 1].key);
      }
    }
  }
  return plan;
}

function slaFor(spec: ProjectSpec, stage: StageKey): number {
  return spec.slaOverrides?.[stage] ?? STAGE_BY_KEY[stage].default_sla_days;
}

function buildProject(spec: ProjectSpec, now: Date, ctx: Ctx): Project {
  const projectId = "p-" + String(spec.code_seq).padStart(2, "0");
  const district = districts.find((d) => d.id === spec.district)!;
  const plan = visitPlan(spec);
  const pace = spec.pastPace ?? 0.6;

  // Durations: completed visits consume `pace` of their SLA, the open one uses daysIn.
  const durations = plan.map((stage, i) =>
    i === plan.length - 1 ? spec.daysIn : Math.max(1, Math.round(slaFor(spec, stage) * pace)),
  );
  const totalSpan = durations.reduce((a, b) => a + b, 0);
  let cursor = addDays(now, -totalSpan);
  const createdAt = cursor.toISOString();

  const attempts: Record<string, number> = {};
  let currentInstanceId: string | null = null;

  plan.forEach((stage, i) => {
    const last = i === plan.length - 1;
    attempts[stage] = (attempts[stage] ?? 0) + 1;
    const sla = slaFor(spec, stage);
    const started = cursor;
    const ended = addDays(started, durations[i]);
    const deptId = deptIdOf(stage);
    const deptDesks = desksOf(deptId);
    const headDesk = HEAD_DESK[deptId];
    const entryDesk = deptDesks[0].id;
    const actor = HEAD_USER[deptId];

    // Was this visit ended by a return?
    const loop = (spec.loops ?? []).find(
      (l) => l.from === stage && attempts[stage] === 1 && !last,
    );

    const instanceId = "si-" + projectId + "-" + (i + 1);
    const reentry = spec.reentered && last;
    const instance: StageInstance = {
      id: instanceId,
      project_id: projectId,
      stage_key: stage,
      attempt_no: attempts[stage],
      status: last ? (spec.escalation ? "BREACHED" : "ACTIVE") : loop ? "RETURNED" : "APPROVED",
      started_at: started.toISOString(),
      due_at: addDays(started, reentry ? spec.reentered!.newSla : sla).toISOString(),
      ended_at: last ? null : ended.toISOString(),
      sla_days: reentry ? spec.reentered!.newSla : sla,
      entered_via: i === 0 ? "FORWARD" : reentry ? "REENTRY" : attempts[stage] > 1 ? "RETURN" : "FORWARD",
      holder_desk_id: last ? (deptDesks[1] ?? deptDesks[0]).id : headDesk,
    };
    if (spec.status === "COMPLETED" && last) {
      instance.status = "APPROVED";
      instance.ended_at = now.toISOString();
    }
    ctx.stage_instances.push(instance);
    if (last) currentInstanceId = instanceId;

    // Movements for this visit.
    const mv = (
      action: FileMovement["action"],
      at: Date,
      from: string | null,
      to: string | null,
      remark: string,
      by = actor,
    ) =>
      ctx.file_movements.push({
        id: "mv-" + projectId + "-" + (ctx.file_movements.length + 1),
        project_id: projectId,
        stage_instance_id: instanceId,
        action,
        from_desk_id: from,
        to_desk_id: to,
        actor_id: by,
        remark,
        created_at: at.toISOString(),
      });

    mv("RECEIVED", started, null, entryDesk, "File received at " + desks.find((d) => d.id === entryDesk)!.designation + ".");
    if (deptDesks.length > 1) {
      const midDesk = deptDesks[1].id;
      mv(
        "FORWARDED",
        addDays(started, Math.max(1, Math.round(durations[i] * 0.4))),
        entryDesk,
        midDesk,
        "Forwarded for scrutiny.",
      );
      if (last && stage === "ADMIN_APPROVAL" && deptDesks[2]) {
        // R2 — parallel sub-task in the same stage.
        ctx.subtasks.push({
          id: "st-" + projectId + "-1",
          stage_instance_id: instanceId,
          department_id: deptId,
          desk_id: deptDesks[2].id,
          title: "Planning concurrence",
          status: "OPEN",
          opened_at: addDays(started, 1).toISOString(),
          closed_at: null,
        });
        mv("SUBTASK_OPENED", addDays(started, 1), midDesk, deptDesks[2].id, "Sub-task opened: Planning concurrence.");
      }
    }
    if (!last) {
      if (loop) {
        mv("RETURNED", ended, headDesk, null, loop.reason);
      } else {
        mv("APPROVED", ended, headDesk, null, "Approved at " + STAGE_BY_KEY[stage].name + ".");
      }
    }

    cursor = ended;
  });

  const status: Project["status"] = spec.status ?? "ACTIVE";
  const project: Project = {
    id: projectId,
    project_code:
      "GJ-" +
      STAGE_BY_KEY[spec.stage].owner_department_code.slice(0, 2) +
      "-2026-" +
      district.code +
      "-" +
      String(spec.code_seq).padStart(4, "0"),
    title: spec.title,
    description: spec.description,
    district_id: spec.district,
    sanctioned_cost: spec.cost,
    status,
    priority: spec.priority ?? "NORMAL",
    current_stage_key: spec.stage,
    current_stage_instance_id: currentInstanceId,
    created_by: "u-ministry",
    created_at: createdAt,
    assigned_site_engineer_id: spec.execution ? "u-site-eng" : null,
  };

  // --- escalations -------------------------------------------------------
  if (spec.escalation && currentInstanceId) {
    const inst = ctx.stage_instances.find((s) => s.id === currentInstanceId)!;
    const escId = "esc-" + projectId;
    ctx.escalations.push({
      id: escId,
      project_id: projectId,
      stage_instance_id: currentInstanceId,
      breached_at: inst.due_at,
      status: spec.escalation,
    });
    ctx.file_movements.push({
      id: "mv-" + projectId + "-esc",
      project_id: projectId,
      stage_instance_id: currentInstanceId,
      action: "ESCALATED",
      from_desk_id: inst.holder_desk_id,
      to_desk_id: null,
      actor_id: "u-admin",
      remark: "SLA breached — escalated to the Ministry. Forward movement frozen.",
      created_at: inst.due_at,
    });
    if (spec.escalation === "UNDER_REVIEW") {
      ctx.justifications.push({
        id: "just-" + projectId,
        escalation_id: escId,
        submitted_by: HEAD_USER[deptIdOf(spec.stage)],
        cause: "DOCUMENTS_PENDING",
        explanation:
          "The revised detailed estimate and the land ownership certificate for two of the village stretches were not received from the district office in time. Scrutiny could not be closed without them.",
        impact:
          "Administrative approval is held up, which pushes the tender date beyond the current financial year target.",
        proposed_fix:
          "The district office has been asked to submit both documents. A dedicated officer has been deputed to follow up daily.",
        new_eta: addDays(now, 12).toISOString().slice(0, 10),
        created_at: addDays(new Date(inst.due_at), 1).toISOString(),
      });
      const threadId = "th-" + projectId;
      ctx.chat_threads.push({
        id: threadId,
        escalation_id: escId,
        created_by: "u-ministry",
        created_at: addDays(new Date(inst.due_at), 1.2).toISOString(),
      });
      ctx.chat_messages.push(
        {
          id: "cm-" + projectId + "-1",
          thread_id: threadId,
          sender_id: "u-ministry",
          body: "Why was the district office not followed up before the SLA was 75% used? Please state the exact date both documents will be in hand.",
          created_at: addDays(new Date(inst.due_at), 1.3).toISOString(),
        },
        {
          id: "cm-" + projectId + "-2",
          thread_id: threadId,
          sender_id: HEAD_USER[deptIdOf(spec.stage)],
          body: "Two reminders were issued on the 9th and the 16th. The collectorate has now confirmed both documents by the end of this week. We expect scrutiny to close within 12 days.",
          created_at: addDays(new Date(inst.due_at), 1.5).toISOString(),
        },
      );
    }
  }

  // --- a past escalation that was decided, causing the re-entry ----------
  if (spec.reentered && currentInstanceId) {
    const prev = ctx.stage_instances.filter((s) => s.project_id === projectId);
    const source = prev[prev.length - 2] ?? prev[0];
    const escId = "esc-" + projectId + "-past";
    ctx.escalations.push({
      id: escId,
      project_id: projectId,
      stage_instance_id: source.id,
      breached_at: source.due_at,
      status: "DECIDED",
    });
    ctx.justifications.push({
      id: "just-" + projectId,
      escalation_id: escId,
      submitted_by: "u-rb-head",
      cause: "LAND_OR_CLEARANCE",
      explanation:
        "Technical sanction could not be issued because the alignment crossed a parcel whose land clearance was pending with the revenue department.",
      impact: "The file stayed at the Superintending Engineer desk beyond the sanctioned SLA.",
      proposed_fix: "Clearance has since been granted. Sanction can be issued on the revised alignment.",
      new_eta: addDays(now, 10).toISOString().slice(0, 10),
      created_at: addDays(new Date(source.due_at), 1).toISOString(),
    });
    const threadId = "th-" + projectId;
    ctx.chat_threads.push({
      id: threadId,
      escalation_id: escId,
      created_by: "u-ministry",
      created_at: addDays(new Date(source.due_at), 1.2).toISOString(),
    });
    ctx.chat_messages.push({
      id: "cm-" + projectId + "-1",
      thread_id: threadId,
      sender_id: "u-ministry",
      body: "Confirm in writing that the revenue clearance is on record before sanction is issued.",
      created_at: addDays(new Date(source.due_at), 1.3).toISOString(),
    });
    ctx.decisions.push({
      id: "dec-" + projectId,
      escalation_id: escId,
      decided_by: "u-ministry",
      decision_type: "RETURN_TO_STAGE",
      changes_ordered: spec.reentered.changes,
      reason: spec.reentered.reason,
      new_sla_days: spec.reentered.newSla,
      reentry_stage_key: spec.stage,
      priority: "HIGH",
      created_at: addDays(new Date(source.due_at), 2).toISOString(),
    });
    ctx.file_movements.push({
      id: "mv-" + projectId + "-reentry",
      project_id: projectId,
      stage_instance_id: currentInstanceId,
      action: "REENTERED",
      from_desk_id: null,
      to_desk_id: HEAD_DESK[deptIdOf(spec.stage)],
      actor_id: "u-ministry",
      remark: "Re-entered after the Ministry decision, priority HIGH, SLA " + spec.reentered.newSla + " days.",
      created_at: addDays(new Date(source.due_at), 2).toISOString(),
    });
  }

  // --- site execution data ------------------------------------------------
  if (spec.execution) {
    const inst = ctx.stage_instances.find((s) => s.id === currentInstanceId)!;
    const start = new Date(inst.started_at);
    const items = [
      { title: "Site clearance & setting out", weight: 10, actual: 100 },
      { title: "Foundation & sub-structure", weight: 25, actual: 100 },
      { title: "Structure / pavement layers", weight: 35, actual: spec.code_seq === 12 ? 55 : 70 },
      { title: "Finishing & services", weight: 20, actual: 0 },
      { title: "Handover & snag clearing", weight: 10, actual: 0 },
    ];
    let offset = 0;
    items.forEach((it, i) => {
      const span = Math.round((inst.sla_days * it.weight) / 100);
      ctx.checklist.push({
        id: "ci-" + projectId + "-" + (i + 1),
        project_id: projectId,
        title: it.title,
        planned_start: addDays(start, offset).toISOString(),
        planned_end: addDays(start, offset + span).toISOString(),
        weight_pct: it.weight,
        actual_pct: it.actual,
        status: it.actual === 100 ? "DONE" : it.actual > 0 ? "IN_PROGRESS" : "NOT_STARTED",
      });
      offset += span;
    });
    const progress = items.reduce((a, it) => a + (it.weight * it.actual) / 100, 0);

    // Running account bills: two paid, one awaiting verification.
    const billBase = Math.round(spec.cost / 5);
    ["RA-01", "RA-02", "RA-03"].forEach((no, i) => {
      ctx.bills.push({
        id: "bill-" + projectId + "-" + (i + 1),
        project_id: projectId,
        bill_no: no,
        amount: billBase,
        submitted_by: "u-site-eng",
        submitted_at: addDays(now, -60 + i * 25).toISOString(),
        status: i < 2 ? "PAID" : "SUBMITTED",
        paid_at: i < 2 ? addDays(now, -50 + i * 25).toISOString() : null,
      });
    });

    // One project carries an approved extension of time, one a pending request.
    ctx.eots.push({
      id: "eot-" + projectId,
      project_id: projectId,
      days_requested: spec.code_seq === 12 ? 30 : 21,
      reason:
        spec.code_seq === 12
          ? "Monsoon stoppage of 24 days and irregular aggregate supply from the Kim quarry."
          : "Redesign of the OT block services after the fire NOC observations.",
      status: spec.code_seq === 12 ? "APPROVED" : "PENDING",
      requested_by: "u-site-eng",
      decided_by: spec.code_seq === 12 ? "u-site-head" : null,
      created_at: addDays(now, -30).toISOString(),
      decided_at: spec.code_seq === 12 ? addDays(now, -26).toISOString() : null,
    });

    for (let w = 3; w >= 1; w--) {
      ctx.reports.push({
        id: "er-" + projectId + "-" + w,
        project_id: projectId,
        report_type: "WEEKLY",
        submitted_by: "u-site-eng",
        progress_pct: Math.round(progress - (w - 1) * 3),
        remarks:
          w === 1
            ? "Pavement work resumed after the rain break. Two rollers deployed."
            : "Progress limited by material supply; kerb casting continued.",
        issues: w === 1 ? "Aggregate supply irregular from the Kim quarry." : "",
        photo_paths: [],
        created_at: addDays(now, -7 * w).toISOString(),
      });
    }
  }

  // --- late-stage projects: bills on record, and a signed completion report -
  if (stageSeq(spec.stage) >= stageSeq("COMPLETION_REPORT")) {
    const billBase = Math.round(spec.cost / 4);
    const closed = spec.status === "COMPLETED";
    ["RA-01", "RA-02", "RA-03", "FINAL"].forEach((no, i) => {
      const paid = closed || i < 3;
      ctx.bills.push({
        id: "bill-" + projectId + "-" + (i + 1),
        project_id: projectId,
        bill_no: no,
        amount: billBase,
        submitted_by: "u-site-eng",
        submitted_at: addDays(now, -120 + i * 25).toISOString(),
        status: paid ? "PAID" : "VERIFIED",
        paid_at: paid ? addDays(now, -110 + i * 25).toISOString() : null,
      });
    });
    ctx.completions.push({
      id: "cr-" + projectId,
      project_id: projectId,
      work_done_summary:
        "Work completed as per the sanctioned drawings and the approved estimate. Snag list cleared and the site handed over to the division.",
      total_billed: billBase * 4,
      dues: closed ? 0 : billBase,
      problems_faced:
        "Monsoon stoppage, delayed shifting of a water main and irregular material supply in the middle quarter.",
      delay_days: 26,
      delay_reasons:
        "Site Execution ran 26 days beyond its SLA. Extension of time granted for monsoon stoppage.",
      signed_by: "u-rb-head",
      ai_drafted: false,
      created_at: addDays(now, -20).toISOString(),
    });
  }

  return project;
}

export function buildSeed(): Database {
  const now = new Date();
  const ctx: Ctx = {
    stage_instances: [],
    file_movements: [],
    subtasks: [],
    escalations: [],
    justifications: [],
    chat_threads: [],
    chat_messages: [],
    decisions: [],
    checklist: [],
    reports: [],
    bills: [],
    eots: [],
    completions: [],
  };
  const projects = SPECS.map((spec) => buildProject(spec, now, ctx));

  return {
    departments,
    desks,
    profiles,
    districts,
    projects,
    project_sla_overrides: SPECS.flatMap((s) =>
      Object.entries(s.slaOverrides ?? {}).map(([stage_key, sla_days]) => ({
        project_id: "p-" + String(s.code_seq).padStart(2, "0"),
        stage_key: stage_key as StageKey,
        sla_days: sla_days as number,
      })),
    ),
    stage_instances: ctx.stage_instances,
    subtasks: ctx.subtasks,
    file_movements: ctx.file_movements,
    escalations: ctx.escalations,
    justifications: ctx.justifications,
    chat_threads: ctx.chat_threads,
    chat_messages: ctx.chat_messages,
    decisions: ctx.decisions,
    execution_checklist_items: ctx.checklist,
    execution_reports: ctx.reports,
    ra_bills: ctx.bills,
    eot_requests: ctx.eots,
    completion_reports: ctx.completions,
    system_clock: { id: 1, offset_minutes: 0 },
    seq_counters: { "2026": SPECS.length },
  };
}
