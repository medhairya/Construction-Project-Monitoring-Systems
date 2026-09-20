/**
 * Loads the demo data into a real Supabase project.
 *
 * It reads `.data/pwfts.json` — the exact dataset the local app is running on,
 * including the 15 projects, their stage history, movements, escalations and
 * chat threads — creates the demo users in Supabase Auth, maps every local id
 * to a UUID, and inserts the rows in foreign-key order.
 *
 *   npm run dev            # once, so .data/pwfts.json exists
 *   npm run db:push        # migrations (or paste them in the SQL editor)
 *   npm run db:seed:remote # this script
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const DEMO_PASSWORD = "Demo@1234";

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase's new secret key, or the older service-role JWT.
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local.",
  );
  process.exit(1);
}

const dataFile = path.join(process.cwd(), ".data", "pwfts.json");
if (!fs.existsSync(dataFile)) {
  console.error("No .data/pwfts.json — run `npm run dev` and open a page once, then retry.");
  process.exit(1);
}

const db = JSON.parse(fs.readFileSync(dataFile, "utf8"));

// The local file is written by a running dev server that caches the database
// in memory. If a test run or a demo left the clock shifted, every SLA in the
// upload would be wrong, so refuse rather than seed a skewed dataset.
const offsetDays = db.system_clock.offset_minutes / 1440;
if (offsetDays !== 0 && !process.argv.includes("--allow-shifted-clock")) {
  console.error(
    [
      "The local demo clock is " + offsetDays + " days ahead, so this data is skewed.",
      "Stop the dev server, delete .data, start it again and load one page, then retry.",
      "Pass --allow-shifted-clock to seed anyway.",
    ].join(" "),
  );
  process.exit(1);
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Local ids are short strings; Postgres wants UUIDs. Map them consistently. */
const ids = new Map();
const uuid = (localId) => {
  if (localId === null || localId === undefined) return null;
  if (!ids.has(localId)) ids.set(localId, crypto.randomUUID());
  return ids.get(localId);
};

async function wipe() {
  // fn_reset_data truncates, which is the only way past the R8 append-only
  // triggers - and deliberately so: rebuilding the demo is allowed, editing a
  // single audit row is not.
  const { error } = await supabase.rpc("fn_reset_data", { p_keep_reference: false });
  if (error) {
    console.error("Could not reset the data: " + error.message);
    console.error("Have the migrations been applied? Run `npm run db:push` first.");
    process.exit(1);
  }
}

async function insert(table, rows) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) {
    console.error("Failed inserting into " + table + ": " + error.message);
    process.exit(1);
  }
  console.log("  " + table + ": " + rows.length);
}

async function createUsers() {
  // Existing demo users are reused, so the script can be re-run.
  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const byEmail = new Map((existing?.users ?? []).map((u) => [u.email, u.id]));

  for (const profile of db.profiles) {
    const email = profile.email.includes("@demo")
      ? profile.email.replace("@demo", "@demo.gov.in")
      : profile.email;
    let authId = byEmail.get(email);
    if (!authId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
      });
      if (error) {
        console.error("Could not create " + email + ": " + error.message);
        process.exit(1);
      }
      authId = data.user.id;
    }
    // Profiles are keyed by the auth user id.
    ids.set(profile.id, authId);
  }
  console.log("  auth users: " + db.profiles.length);
}

async function main() {
  console.log("Clearing existing rows…");
  await wipe();

  console.log("Creating auth users…");
  await createUsers();

  console.log("Inserting reference data…");
  await insert("departments", db.departments.map((d) => ({ id: uuid(d.id), code: d.code, name: d.name })));
  await insert("districts", db.districts.map((d) => ({ id: uuid(d.id), code: d.code, name: d.name })));
  await insert(
    "desks",
    db.desks.map((d) => ({
      id: uuid(d.id),
      department_id: uuid(d.department_id),
      designation: d.designation,
      officer_name: d.officer_name,
      phone: d.phone,
      email: d.email,
    })),
  );
  await insert(
    "profiles",
    db.profiles.map((p) => ({
      id: uuid(p.id),
      email: p.email.replace("@demo", "@demo.gov.in"),
      full_name: p.full_name,
      role: p.role,
      department_id: uuid(p.department_id),
      desk_id: uuid(p.desk_id),
    })),
  );

  const STAGES = [
    ["MINISTRY_PROPOSAL", 1, "Ministry Proposal", "MIN", 15],
    ["ADMIN_APPROVAL", 2, "Administrative Approval + Fund Allotment", "FIN", 21],
    ["TECH_SANCTION", 3, "Technical Sanction", "RB", 21],
    ["TENDER", 4, "Tender (nProcure)", "TND", 45],
    ["WORK_ORDER", 5, "Work Order", "RB", 7],
    ["SITE_EXECUTION", 6, "Site Execution", "SITE", 180],
    ["COMPLETION_REPORT", 7, "Completion Report", "RB", 15],
    ["FINAL_BILL", 8, "Final Bill", "FIN", 30],
    ["DLP_CLOSURE", 9, "Defect Liability Period & Closure", "RB", 365],
  ];
  await insert(
    "stage_definitions",
    STAGES.map(([key, seq, name, deptCode, sla]) => ({
      key,
      seq,
      name,
      owner_department_id: uuid(db.departments.find((d) => d.code === deptCode).id),
      default_sla_days: sla,
    })),
  );

  console.log("Inserting projects and their history…");
  await insert(
    "projects",
    db.projects.map((p) => ({
      id: uuid(p.id),
      project_code: p.project_code,
      title: p.title,
      description: p.description,
      district_id: uuid(p.district_id),
      sanctioned_cost: p.sanctioned_cost,
      status: p.status,
      priority: p.priority,
      current_stage_key: p.current_stage_key,
      current_stage_instance_id: null, // set after the instances exist
      assigned_site_engineer_id: uuid(p.assigned_site_engineer_id),
      created_by: uuid(p.created_by),
      created_at: p.created_at,
    })),
  );

  await insert(
    "project_sla_overrides",
    db.project_sla_overrides.map((o) => ({
      project_id: uuid(o.project_id),
      stage_key: o.stage_key,
      sla_days: o.sla_days,
    })),
  );

  await insert(
    "stage_instances",
    db.stage_instances.map((s) => ({
      id: uuid(s.id),
      project_id: uuid(s.project_id),
      stage_key: s.stage_key,
      attempt_no: s.attempt_no,
      status: s.status,
      started_at: s.started_at,
      due_at: s.due_at,
      ended_at: s.ended_at,
      sla_days: s.sla_days,
      entered_via: s.entered_via,
      holder_desk_id: uuid(s.holder_desk_id),
    })),
  );

  for (const p of db.projects) {
    if (!p.current_stage_instance_id) continue;
    await supabase
      .from("projects")
      .update({ current_stage_instance_id: uuid(p.current_stage_instance_id) })
      .eq("id", uuid(p.id));
  }

  await insert(
    "subtasks",
    db.subtasks.map((s) => ({
      id: uuid(s.id),
      stage_instance_id: uuid(s.stage_instance_id),
      department_id: uuid(s.department_id),
      desk_id: uuid(s.desk_id),
      title: s.title,
      status: s.status,
      opened_at: s.opened_at,
      closed_at: s.closed_at,
    })),
  );

  await insert(
    "file_movements",
    db.file_movements.map((m) => ({
      id: uuid(m.id),
      project_id: uuid(m.project_id),
      stage_instance_id: uuid(m.stage_instance_id),
      action: m.action,
      from_desk_id: uuid(m.from_desk_id),
      to_desk_id: uuid(m.to_desk_id),
      actor_id: uuid(m.actor_id),
      remark: m.remark,
      created_at: m.created_at,
    })),
  );

  console.log("Inserting escalations…");
  await insert(
    "escalations",
    db.escalations.map((e) => ({
      id: uuid(e.id),
      project_id: uuid(e.project_id),
      stage_instance_id: uuid(e.stage_instance_id),
      breached_at: e.breached_at,
      status: e.status,
    })),
  );
  await insert(
    "justifications",
    db.justifications.map((j) => ({
      id: uuid(j.id),
      escalation_id: uuid(j.escalation_id),
      submitted_by: uuid(j.submitted_by),
      cause: j.cause,
      explanation: j.explanation,
      impact: j.impact,
      proposed_fix: j.proposed_fix,
      new_eta: j.new_eta.slice(0, 10),
      created_at: j.created_at,
    })),
  );
  await insert(
    "chat_threads",
    db.chat_threads.map((t) => ({
      id: uuid(t.id),
      escalation_id: uuid(t.escalation_id),
      created_by: uuid(t.created_by),
      created_at: t.created_at,
    })),
  );
  await insert(
    "chat_messages",
    db.chat_messages.map((m) => ({
      id: uuid(m.id),
      thread_id: uuid(m.thread_id),
      sender_id: uuid(m.sender_id),
      body: m.body,
      created_at: m.created_at,
    })),
  );
  await insert(
    "decisions",
    db.decisions.map((d) => ({
      id: uuid(d.id),
      escalation_id: uuid(d.escalation_id),
      decided_by: uuid(d.decided_by),
      decision_type: d.decision_type,
      changes_ordered: d.changes_ordered,
      reason: d.reason,
      new_sla_days: d.new_sla_days,
      reentry_stage_key: d.reentry_stage_key,
      priority: d.priority,
      created_at: d.created_at,
    })),
  );

  console.log("Inserting execution data…");
  await insert(
    "execution_checklist_items",
    db.execution_checklist_items.map((c) => ({
      id: uuid(c.id),
      project_id: uuid(c.project_id),
      title: c.title,
      planned_start: c.planned_start.slice(0, 10),
      planned_end: c.planned_end.slice(0, 10),
      weight_pct: c.weight_pct,
      actual_pct: c.actual_pct,
      status: c.status,
    })),
  );
  await insert(
    "execution_reports",
    db.execution_reports.map((r) => ({
      id: uuid(r.id),
      project_id: uuid(r.project_id),
      report_type: r.report_type,
      submitted_by: uuid(r.submitted_by),
      progress_pct: r.progress_pct,
      remarks: r.remarks,
      issues: r.issues,
      photo_paths: r.photo_paths,
      created_at: r.created_at,
    })),
  );
  await insert(
    "ra_bills",
    db.ra_bills.map((b) => ({
      id: uuid(b.id),
      project_id: uuid(b.project_id),
      bill_no: b.bill_no,
      amount: b.amount,
      submitted_at: b.submitted_at,
      status: b.status,
      paid_at: b.paid_at,
    })),
  );
  await insert(
    "eot_requests",
    db.eot_requests.map((e) => ({
      id: uuid(e.id),
      project_id: uuid(e.project_id),
      days_requested: e.days_requested,
      reason: e.reason,
      status: e.status,
      decided_by: uuid(e.decided_by),
    })),
  );
  await insert(
    "completion_reports",
    db.completion_reports.map((c) => ({
      id: uuid(c.id),
      project_id: uuid(c.project_id),
      work_done_summary: c.work_done_summary,
      total_billed: c.total_billed,
      dues: c.dues,
      problems_faced: c.problems_faced,
      delay_days: c.delay_days,
      delay_reasons: c.delay_reasons,
      signed_by: uuid(c.signed_by),
      ai_drafted: c.ai_drafted,
    })),
  );

  console.log("\nDone. Demo accounts use the password " + DEMO_PASSWORD + ".");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
