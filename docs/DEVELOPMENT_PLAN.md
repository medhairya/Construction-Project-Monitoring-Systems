# PWFTS — Public Works File Tracking & Project Monitoring System
### Development Plan (Hackathon MVP → AI)

> **How to use this file:** Put it in the repo root as `DEVELOPMENT_PLAN.md`. Give it to your coding agent (Claude Code) and build **one phase at a time**. Every phase has a goal, tasks, acceptance criteria and a ready-to-paste prompt. Do not start a phase until the previous phase's acceptance criteria pass.

---

## 0. Product Summary

**Problem.** A government construction project passes through many departments before, during and after construction. Delays mostly happen while the *file* is sitting at a desk, not only at the site. Today nobody can answer quickly: *Where is the file? With whom? For how long? Why?*

**Solution.** A role-based web application where department heads enter a **Project ID** and see:
1. The stage the project is in, across all departments (the "Project Passport").
2. Inside their **own** department, which desk or officer holds the file right now, and its full movement history.
3. SLA timers for every stage. A breach triggers a mandatory justification, a Ministry review, an official logged chat, and a structured Ministry decision. The file then re-enters the flow with **HIGH priority**.
4. (Final phase) AI that predicts delays, warns before an SLA breach, drafts completion reports and drafts Ministry decisions. **AI recommends; officers decide.**

**Hackathon deliverables:** hosted link · source code · architecture (`docs/architecture.excalidraw`).

---

## 1. Domain Rules (Source of Truth)

> These rules come from the team's architecture diagram. They are a simplified version of the CPWD Works Manual (Ch. 2) and the CPWA Code, and should be validated against the Gujarat PWD Manual. Every implementation must follow them.

### 1.1 Stages (strictly sequential)

| # | Stage key | Stage name | Owning department | Default SLA (days) |
|---|---|---|---|---|
| 1 | `MINISTRY_PROPOSAL` | Ministry Proposal (Project ID generated) | Ministry (CMO) | 15 |
| 2 | `ADMIN_APPROVAL` | Administrative Approval + Fund Allotment | Finance | 21 |
| 3 | `TECH_SANCTION` | Technical Sanction | R&B / PWD | 21 |
| 4 | `TENDER` | Tender (nProcure) | Tender Cell | 45 |
| 5 | `WORK_ORDER` | Work Order | R&B Division (EE) | 7 |
| 6 | `SITE_EXECUTION` | Site Execution | Site Engineers (+ Contractor) | per project (e.g. 180) |
| 7 | `COMPLETION_REPORT` | Completion Report | EE + Site Team | 15 |
| 8 | `FINAL_BILL` | Final Bill | Finance / Accounts | 30 |
| 9 | `DLP_CLOSURE` | Defect Liability Period & Closure | R&B Division | per project (e.g. 365) |

### 1.2 Workflow rules
- **R1. One active stage.** A project has exactly one active stage at any time. Two stages never run in parallel.
- **R2. Parallel work within a stage.** Inside the active stage, desks of **more than one department** may hold sub-tasks at the same time (e.g. Accounts and Planning both review during AA). The stage can advance only when all sub-tasks are closed and the owning department's head approves.
- **R3. Advancing.** Only the **head of the owning department** can approve a stage. Approval moves the project to the next stage.
- **R4. Returns.** A head can **return** the file to **any earlier stage**. A reason is mandatory. The target stage gets a new stage instance and its SLA clock restarts.
- **R5. Project ID.** Generated **only** at Stage 1 when the Ministry creates the proposal. Format: `GJ-{DEPT}-{YYYY}-{DISTRICT}-{SEQ4}`, e.g. `GJ-RB-2026-AHD-0042`.
- **R6. SLA.** Each stage instance has an SLA (days). Defaults come from the table above and can be overridden per project when the project is created, or later by a Ministry decision.
- **R7. SLA breach flow.**
  1. When the SLA is exceeded, the stage instance is marked `BREACHED`, the project status becomes `ESCALATED`, and forward movement is frozen.
  2. The **officer holding the file** (and their head) must submit a **structured justification**: cause category, detailed explanation, impact, proposed fix, and new ETA.
  3. The justification goes to the **Ministry** for review.
  4. The Ministry may open an **Official Chat** thread with the involved officers. Every message is stored permanently and can't be edited or deleted.
  5. The Ministry records a **Structured Decision**: decision type, the changes ordered, the reason, the new SLA, the re-entry stage, and the priority.
  6. The file **re-enters the flow** at the stage chosen in the decision, with `priority = HIGH` and the new SLA. Project status returns to `ACTIVE`.
- **R8. Audit.** Every file movement, approval, return, justification, chat message and decision is **append-only**. Nothing is ever hard-deleted.

### 1.3 Visibility rules (RBAC)
| What | Ministry | Dept Head | Dept Operator | Site Engineer | Super Admin |
|---|---|---|---|---|---|
| Search any project by ID | ✅ | ✅ | ✅ | own projects | ✅ |
| Stage timeline across departments | ✅ | ✅ | ✅ | ✅ (own) | ✅ |
| Desk-level movement **inside own dept** | ✅ (all) | ✅ | ✅ | ❌ | ✅ |
| Desk-level movement of **other depts** | ✅ | ❌ (summary only) | ❌ | ❌ | ✅ |
| Approve / return a stage | own stage | own dept's stage | ❌ | ❌ | ❌ |
| Forward file between desks | ❌ | ✅ | ✅ | ❌ | ❌ |
| Submit execution reports | ❌ | ❌ | ❌ | ✅ | ❌ |
| Escalation decisions | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create projects (Stage 1) | ✅ | ❌ | ❌ | ❌ | ✅ |
| Manage users / SLA defaults | ❌ | ❌ | ❌ | ❌ | ✅ |

What other departments see is a **summary line only**: `With Finance Dept · 12 days · SLA 21 days`.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | One codebase for UI and API; deploys easily to Vercel |
| UI | **Tailwind CSS + shadcn/ui** + lucide icons | Clean, government-dashboard look, fast to build |
| DB / Auth / Storage / Realtime | **Supabase** (Postgres, Auth, Storage, Realtime) | Row Level Security for RBAC, realtime for the chat, free tier |
| Validation | **Zod** | Shared schemas for forms and server actions |
| Charts | **Recharts** | Dashboards |
| SLA scheduler | **Supabase `pg_cron`** (every 10 min) + a check on page load + a **demo clock** | Reliable; the demo clock lets you show a breach live |
| AI (Phase 6) | **Anthropic API** (Claude) via server-side route | Summaries, drafts, explanations |
| Hosting | **Vercel** (app) + **Supabase Cloud** (DB) | Hosted link from day 1 |
| Testing | **Vitest** (state machine unit tests) + **Playwright** (1–2 happy-path E2E tests) | Protect the workflow logic |

**Environment variables** (`.env.local`, never committed):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only
ANTHROPIC_API_KEY=              # Phase 6, server only
DEMO_MODE=true                  # enables the demo clock + seed reset
```

---

## 3. Folder Structure

```
/app
  /(auth)/login
  /(app)/dashboard                 # role-based home
  /(app)/projects                  # search + list
  /(app)/projects/new              # Ministry: create proposal (Stage 1)
  /(app)/projects/[projectId]      # Project Passport
  /(app)/projects/[projectId]/movement   # desk-level log (own dept only)
  /(app)/projects/[projectId]/execution  # checklist, reports, bills, EoT
  /(app)/inbox                     # files currently in my department
  /(app)/escalations               # list + detail
  /(app)/escalations/[id]          # justification, chat, decision
  /(app)/admin                     # users, SLA defaults, demo clock
  /api/cron/sla                    # SLA sweep (also callable by pg_cron)
  /api/ai/*                        # Phase 6
/lib
  /workflow        # state machine (pure TS, fully unit tested)
  /sla             # SLA computation
  /rbac            # permission helpers
  /supabase        # clients (browser/server/service)
  /ai              # Phase 6 prompts + schemas
/supabase
  /migrations      # SQL migrations (tables, enums, RLS, functions)
  seed.sql         # demo data
/docs
  architecture.excalidraw
  DEVELOPMENT_PLAN.md
CLAUDE.md
```

---

## 4. Data Model

### 4.1 Enums
```
role_type:        MINISTRY | DEPT_HEAD | DEPT_OPERATOR | SITE_ENGINEER | SUPER_ADMIN
stage_key:        (the 9 stages above)
project_status:   ACTIVE | ESCALATED | COMPLETED | CANCELLED
priority_level:   NORMAL | HIGH
stage_status:     ACTIVE | APPROVED | RETURNED | BREACHED
movement_action:  RECEIVED | FORWARDED | SUBTASK_OPENED | SUBTASK_CLOSED | APPROVED | RETURNED | ESCALATED | REENTERED | NOTE
breach_cause:     DOCUMENTS_PENDING | FUNDS_UNAVAILABLE | TECHNICAL_ISSUE | CONTRACTOR_DELAY | LAND_OR_CLEARANCE | WEATHER | STAFF_SHORTAGE | OTHER
decision_type:    APPROVE_WITH_NEW_SLA | ORDER_CHANGES | RETURN_TO_STAGE | CANCEL_PROJECT
report_type:      DAILY | WEEKLY | MONTHLY
```

### 4.2 Tables

| Table | Key columns | Notes |
|---|---|---|
| `departments` | id, code (`MIN`,`FIN`,`RB`,`TND`,`SITE`), name | seed |
| `desks` | id, department_id, designation, officer_name, phone, email | desks inside a department |
| `profiles` | id (= auth user id), full_name, role, department_id, desk_id | one per login |
| `districts` | id, code (`AHD`,`VAD`,`SRT`…), name | seed |
| `stage_definitions` | key, seq (1–9), name, owner_department_id, default_sla_days | seed |
| `projects` | id, project_code (unique), title, description, district_id, sanctioned_cost, status, priority, current_stage_key, current_stage_instance_id, created_by, created_at | |
| `project_sla_overrides` | project_id, stage_key, sla_days | set at creation |
| `stage_instances` | id, project_id, stage_key, attempt_no, status, started_at, due_at, ended_at, sla_days, entered_via (`FORWARD`/`RETURN`/`REENTRY`) | a new row every time the project enters a stage |
| `subtasks` | id, stage_instance_id, department_id, desk_id, title, status (`OPEN`/`CLOSED`), opened_at, closed_at | parallel work within a stage (R2) |
| `file_movements` | id, project_id, stage_instance_id, action, from_desk_id, to_desk_id, actor_id, remark, created_at | **append-only** |
| `escalations` | id, project_id, stage_instance_id, breached_at, status (`AWAITING_JUSTIFICATION`/`UNDER_REVIEW`/`DECIDED`) | |
| `justifications` | id, escalation_id, submitted_by, cause, explanation, impact, proposed_fix, new_eta, created_at | structured form |
| `chat_threads` | id, escalation_id, created_by, created_at | |
| `chat_messages` | id, thread_id, sender_id, body, created_at | **append-only**, realtime |
| `decisions` | id, escalation_id, decided_by, decision_type, changes_ordered, reason, new_sla_days, reentry_stage_key, priority, created_at | structured |
| `execution_checklist_items` | id, project_id, title, planned_start, planned_end, weight_pct, actual_pct, status | Stage 6 |
| `execution_reports` | id, project_id, report_type, submitted_by, progress_pct, remarks, issues, photo_paths[], created_at | Stage 6 |
| `ra_bills` | id, project_id, bill_no, amount, submitted_at, status, paid_at | Stage 6 |
| `eot_requests` | id, project_id, days_requested, reason, status, decided_by | Stage 6 events |
| `completion_reports` | id, project_id, work_done_summary, total_billed, dues, problems_faced, delay_days, delay_reasons, signed_by, ai_drafted (bool) | Stage 7 |
| `ai_outputs` | id, project_id, kind, input_hash, output_json, model, created_at | Phase 6, for audit |
| `system_clock` | id=1, offset_minutes | **demo clock** (DEMO_MODE only) |

### 4.3 Database functions (Postgres, `SECURITY DEFINER`)
- `now_app()` returns `now() + offset` from `system_clock`. **Use it everywhere instead of `now()`** so the demo clock works.
- `fn_create_project(...)` creates the project, generates the `project_code` (R5), opens the Stage 1 instance and applies SLA overrides.
- `fn_approve_stage(project_id, actor)` checks R1–R3, closes the current instance, opens the next one.
- `fn_return_stage(project_id, target_stage, reason, actor)` enforces R4.
- `fn_forward_file(project_id, to_desk, remark, actor)` moves the file between desks in the actor's department.
- `fn_sla_sweep()` marks breaches and creates escalations (R7.1). Called by `pg_cron` and by `/api/cron/sla`.
- `fn_record_decision(...)` implements R7.5–R7.6 (re-entry, priority HIGH, new SLA).

All state changes go through these functions, so the rules live in **one place**. Mirror the transition logic in `/lib/workflow` as pure TypeScript for unit tests and UI checks such as "can this user see the Approve button?".

### 4.4 RLS policies (summary)
- `projects`, `stage_instances`: readable by every authenticated user. Site engineers see only projects assigned to them.
- `file_movements`, `subtasks`: readable when `department_of(from_desk or to_desk) = my department` **or** my role is `MINISTRY`/`SUPER_ADMIN`.
- `chat_messages`: readable and insertable by thread participants and the Ministry. **No update or delete policy.**
- `decisions`: insert allowed only for `MINISTRY`.
- All writes to workflow tables go **only** through the RPC functions (revoke direct insert and update).

---

## 5. Screens

| Screen | Who | Key elements |
|---|---|---|
| **Login** | all | Email and password; demo accounts listed on the page when `DEMO_MODE` |
| **Dashboard** | all (role-aware) | KPI cards (active, escalated, SLA at risk, completed); "My Dept Inbox" preview; stage distribution chart |
| **Project Search** | all | Search box for Project ID + filters (district, stage, status, priority) |
| **Project Passport** | all | 9-step horizontal stepper; current stage highlighted; for each stage: dept, days spent vs SLA, attempts (returns shown as loops); HIGH priority badge; action bar (Approve / Return / Forward) shown only when allowed |
| **Movement Log** | own dept | Vertical timeline of desk-to-desk moves with remarks; other departments collapsed to summary lines |
| **Dept Inbox** | head / operator | Table of files currently in my dept: project, stage, desk, days held, SLA remaining (red/amber/green), priority; sorted HIGH priority first, then least SLA remaining |
| **Create Proposal** | Ministry | Form: title, district, cost, description, SLA overrides per stage; shows the generated Project ID on submit |
| **Escalations** | Ministry / involved | List by status; detail page has 3 tabs: **Justification** → **Official Chat** → **Decision** |
| **Execution** | site engineer / EE | Checklist with planned vs actual; submit report (progress %, remarks, photo); RA bills; EoT requests |
| **Admin** | super admin | Users, desks, default SLAs, **demo clock (+1 day / +7 days / reset)**, reset seed data |

**Design direction:** clean government dashboard, white or light-grey background, one strong accent colour. Status colours: green = on track, amber = ≥ 75% of SLA used, red = breached. Use Gujarati and English labels on the main headings if time allows.

---

## 6. Development Phases

> **MVP line:** Phases 0–3 make up the *must-have* demo. Phases 4–5 complete the MVP. Phase 6 adds AI.

---

### Phase 0 — Setup & "Hello, Hosted" (≈ 2–3 h)
**Goal:** Empty app deployed with a working hosted link, before any feature exists.

**Tasks**
1. `create-next-app` (TypeScript, Tailwind, App Router, ESLint). Add shadcn/ui.
2. Create the Supabase project and install `@supabase/supabase-js` and `@supabase/ssr`.
3. Supabase clients in `/lib/supabase` (browser, server, service-role).
4. Add `CLAUDE.md` (see Appendix A) and this plan in `/docs`.
5. Push to GitHub, connect Vercel, set env vars, deploy.
6. Basic layout: sidebar, top bar, placeholder pages for every route in Section 3.

**Acceptance**
- [ ] Vercel URL loads the layout.
- [ ] `npm run build` and `npm run lint` pass.

**Prompt for Claude Code**
> Read `CLAUDE.md` and `docs/DEVELOPMENT_PLAN.md`. Execute **Phase 0 only**. Set up Next.js + TypeScript + Tailwind + shadcn/ui and the Supabase client helpers, and create placeholder pages for all routes in Section 3 with a sidebar layout. Do not build features yet. When done, run build and lint, fix all errors, and list which Phase 0 acceptance criteria pass.

---

### Phase 1 — Data Model, Auth, RBAC, Seed Data (≈ 5–6 h)
**Goal:** The database matches Section 4, users can log in, and each role sees the right navigation.

**Tasks**
1. SQL migrations for all enums and tables in 4.1–4.2 (execution tables too, even if unused yet).
2. `system_clock` + `now_app()`.
3. RLS policies from 4.4.
4. Supabase Auth email/password; `profiles` row per user; middleware that redirects unauthenticated users.
5. `/lib/rbac` helpers: `can(user, action, resource)`.
6. **Seed data** (`supabase/seed.sql`):
   - 5 departments, ~12 desks with realistic designations (Section Officer, Deputy Secretary, Accounts Officer, EE, DE, JE…).
   - 3 districts (Ahmedabad, Vadodara, Surat).
   - Demo users: `ministry@demo`, `finance.head@demo`, `finance.op@demo`, `rb.head@demo`, `rb.op@demo`, `tender.head@demo`, `site.eng@demo`, `admin@demo` (password `Demo@1234`).
   - **15 projects** spread across all 9 stages, including: 3 on track, 3 at ≥ 75% SLA, 2 breached / escalated (one awaiting justification, one with an active chat), 2 with a return loop in their history, 1 HIGH-priority re-entered project, 2 in Site Execution with reports, 1 completed.
7. Role-aware sidebar.

**Acceptance**
- [ ] Each demo user logs in and sees the right menu.
- [ ] A Finance operator **cannot** read R&B `file_movements` (verified by an SQL test or script).
- [ ] Seed can be re-run cleanly.

**Prompt**
> Execute **Phase 1** of `docs/DEVELOPMENT_PLAN.md`. Write the Supabase SQL migrations for Section 4 (enums, tables, `now_app()`, RLS from 4.4), Supabase Auth with a `profiles` table, middleware, `/lib/rbac`, and the seed data described in Phase 1 step 6. Add a script `npm run db:reset` that resets and seeds. Verify the RLS rule "Finance cannot read R&B desk movements" with a test. Stop at the end of Phase 1 and report the acceptance status.

---

### Phase 2 — Workflow Engine + Project Passport + Inbox (≈ 6–8 h) ⭐ core
**Goal:** The core file-tracking experience works end to end.

**Tasks**
1. `/lib/workflow` as pure TypeScript: `nextStage`, `canApprove`, `canReturn(target)`, `canForward`, `validateTransition`. **Write Vitest tests first** for R1–R5.
2. Postgres functions: `fn_create_project`, `fn_approve_stage`, `fn_return_stage`, `fn_forward_file`, and subtask open/close (R2). Each writes to `file_movements`.
3. Server actions that call the RPCs, with Zod validation.
4. **Create Proposal** page (Ministry) → shows the generated Project ID.
5. **Project Search** + **Project Passport** (stepper, per-stage days vs SLA, return loops visible, action bar).
6. **Movement Log** following the visibility rules.
7. **Dept Inbox** sorted by priority, then SLA remaining.

**Acceptance**
- [ ] Ministry creates a project → gets `GJ-RB-2026-AHD-00xx` → the project appears in Finance's inbox.
- [ ] Finance operator forwards the file between two desks → the movement log shows it; R&B users see only the summary line.
- [ ] Finance head approves → the project moves to Technical Sanction.
- [ ] R&B head returns it to Admin Approval with a reason → a new stage instance, the SLA restarts, and the loop shows on the Passport.
- [ ] Nobody can approve a stage their department doesn't own (UI **and** DB enforce it).
- [ ] All workflow unit tests pass.

**Prompt**
> Execute **Phase 2**. Start by writing Vitest tests for workflow rules R1–R5 in Section 1.2, then implement `/lib/workflow` until they pass. Then write the Postgres RPC functions from 4.3 (except the SLA and decision functions), the server actions, and the pages: Create Proposal, Project Search, Project Passport, Movement Log and Dept Inbox, following Sections 1.3 and 5. Enforce permissions in both the UI and the DB. Finish by walking through every Phase 2 acceptance criterion using the seed users and fixing anything that fails.

---

### Phase 3 — SLA, Escalation, Official Chat, Ministry Decision (≈ 6–8 h) ⭐ core
**Goal:** Rule R7 works end to end, and a breach can be shown live using the demo clock.

**Tasks**
1. `fn_sla_sweep()` + `pg_cron` every 10 minutes + `/api/cron/sla` (protected by a secret) + a sweep on dashboard load.
2. Amber/red SLA indicators everywhere (Passport, Inbox, Dashboard).
3. Escalation creation → notification banner for the holding officer and the head.
4. **Justification form** (structured, Zod-validated, all fields required).
5. **Official Chat** using Supabase Realtime: append-only, timestamps, sender role badge, "logged permanently" notice.
6. **Structured Decision form** (Ministry only): decision type, changes ordered, reason, new SLA, re-entry stage (dropdown of stages 1…current), priority (defaults to HIGH).
7. `fn_record_decision` → re-entry per R7.6; the Passport shows a "Re-entered after escalation" marker.
8. **Admin demo clock:** +1 day, +7 days, reset.

**Acceptance**
- [ ] Using the demo clock, a stage passes its SLA → escalation appears → forward actions are blocked.
- [ ] The holding officer submits a justification → the Ministry sees it.
- [ ] The Ministry and officer chat; messages can't be edited or deleted (DB-enforced).
- [ ] The Ministry records a decision → the project re-enters at the chosen stage with HIGH priority and the new SLA, and it goes to the top of the inbox.
- [ ] The full history is visible on the escalation page.

**Prompt**
> Execute **Phase 3** (rule R7). Implement `fn_sla_sweep`, `pg_cron` scheduling, the protected `/api/cron/sla` route, SLA colour indicators, the escalation pages (Justification → Official Chat with Supabase Realtime → Structured Decision), `fn_record_decision` with re-entry and HIGH priority, and the admin demo clock using `now_app()`. Chat messages and decisions must be append-only at the DB level. Walk through every Phase 3 acceptance criterion with the seed users.

> ✅ **At this point you have a demo-able MVP.** Deploy and test on the hosted URL before continuing.

---

### Phase 4 — Site Execution, Completion, Final Bill, DLP (≈ 5–6 h)
**Goal:** Stages 6–9 have real screens and data, which the AI will later use.

**Tasks**
1. The Work Order stage creates the execution checklist (template: Site clearance → Foundation → Structure → Finishing → Handover, with weights and planned dates).
2. **Execution page:** checklist (planned vs actual), report submission (daily / weekly / monthly, progress %, remarks, issues, photo upload to Supabase Storage), report compliance indicator (missed reports).
3. RA bills (submit → verify → paid) and EoT requests (EE approves → extends the Site Execution SLA).
4. **Completion Report form:** work done, total billed, dues, problems faced, delay days (auto-computed), delay reasons (pre-filled from EoT and escalations).
5. Final Bill stage: shows dues; Finance marks it settled.
6. DLP stage: countdown; Close Project button.

**Acceptance**
- [ ] A site engineer submits a report with a photo → progress updates on the Passport.
- [ ] An approved EoT extends the Site Execution due date and is logged.
- [ ] The Completion Report auto-fills delay days and reasons.
- [ ] A project can be taken from Stage 1 to closure in one run.

---

### Phase 5 — Dashboards, Notifications, Polish, Demo Readiness (≈ 4–5 h)
**Goal:** It looks like a real government product and the demo runs without problems.

**Tasks**
1. Role dashboards: Ministry (district heatmap/table, escalations, HIGH-priority list), Dept Head (inbox health, average days per desk, bottleneck desk), Site Engineer (my projects, reports due).
2. In-app notifications (bell icon): new file in inbox, SLA at 75%, breach, chat message, decision.
3. Empty, loading and error states; mobile-responsive execution page.
4. "Reset demo data" in Admin.
5. README: setup, demo accounts, architecture image, demo script (Section 8).
6. Playwright E2E test: create → forward → approve → return → breach → decide → re-enter.

**Acceptance**
- [ ] The demo script in Section 8 runs start to finish on the hosted URL in under 7 minutes.
- [ ] No console errors; Lighthouse accessibility ≥ 85 on the main pages.

---

### Phase 6 — AI Layer (≈ 5–6 h)
**Goal:** Four AI features, each **advisory**, explained, logged in `ai_outputs`, and able to fail without breaking the app.

**Principles**
- AI never changes workflow state by itself. It suggests; a human clicks.
- Deterministic metrics are computed in code, and the LLM only **explains** and **drafts**. This makes the numbers defensible to judges.
- All AI calls happen server-side (`/api/ai/*`), and the API key never reaches the browser.
- The LLM returns **strict JSON** validated with Zod, with a fallback message if it fails.
- Every AI output is labelled "AI-generated · review before use" and has a thumbs-up/down button.

**6.1 Delay prediction (Site Execution)** — `POST /api/ai/delay-prediction`
- Computed in code:
  - `planned_pct` (from checklist planned dates and weights at `now_app()`), `actual_pct` (from the latest reports)
  - `SPI = actual_pct / planned_pct` (Schedule Performance Index)
  - `projected_finish = start + elapsed_days / SPI`
  - `delay_days = projected_finish − due_at`
  - Risk adjustments: missed reports (+), open issues (+), monsoon months Jun–Sep (+), pending RA bills (+)
  - `risk = LOW / MEDIUM / HIGH`
- The LLM receives the metrics and the recent report remarks and returns `{ summary, top_causes[], recommended_actions[] }`.
- UI: a risk card on the Passport and Execution page: *"Likely 23 days late (HIGH). Main causes: … Suggested actions: …"*

**6.2 SLA breach early warning (all stages)** — `POST /api/ai/breach-risk`
- In code: `% SLA used`, average historical days for this stage (from seed history), days the file has been at the current desk, desk backlog.
- `breach_probability` from a simple logistic-style score in code. The LLM explains it in one or two sentences and suggests who to nudge.
- UI: an "At risk" badge in the Inbox with a tooltip explanation.

**6.3 Completion report draft** — `POST /api/ai/completion-draft`
- Input: checklist, reports, bills, EoT requests, escalations and decisions.
- Output JSON matching the `completion_reports` fields. It pre-fills the form with `ai_drafted = true`; the officer edits and signs.

**6.4 Escalation assist** — `POST /api/ai/decision-draft`
- Input: justification + chat transcript + project history.
- Output: `{ chat_summary, key_facts[], suggested_decision_type, suggested_new_sla_days, suggested_reentry_stage, draft_reason }`.
- UI: an "AI suggestion" panel next to the Decision form with an "Apply to form" button. The Ministry still submits the decision.

**Acceptance**
- [ ] All four features work on seed data and are logged in `ai_outputs`.
- [ ] With the API key removed, the app still works and shows "AI unavailable".
- [ ] No AI feature can change a stage by itself.

**Prompt**
> Execute **Phase 6**. Follow the principles strictly: compute the metrics deterministically in `/lib/ai/metrics.ts` with unit tests, and use the Anthropic API only to explain and draft, returning strict JSON validated by Zod. Build the four endpoints and their UI panels as described. Log every output to `ai_outputs`, and handle missing API keys and API failures gracefully.

---

## 7. Testing Checklist (run before every deploy)
- [ ] Workflow unit tests (R1–R7) pass.
- [ ] Cannot approve another department's stage (UI and DB).
- [ ] Cannot move a file forward while it's `ESCALATED`.
- [ ] Return to an earlier stage creates a new instance and resets the SLA.
- [ ] Chat messages and decisions can't be updated or deleted.
- [ ] Other departments see only summary lines.
- [ ] The demo clock can force a breach; reset restores it.
- [ ] Hosted URL works in incognito with demo accounts.

---

## 8. Demo Script (≈ 6–7 min)
1. **Ministry** logs in → creates *"Four-lane road, Sanand–Bavla"* → Project ID `GJ-RB-2026-AHD-0016` appears.
2. **Finance operator** → Inbox → forwards from Section Officer to Accounts Officer (parallel subtask to Planning) → **Finance head** approves.
3. **R&B head** at Technical Sanction → **returns** it to Admin Approval ("estimate uses old SOR rates"). The Passport shows the loop.
4. Switch to a seeded project nearing its SLA → **Admin demo clock +7 days** → it turns red → escalation.
5. **Holding officer** submits a justification → **Ministry** opens the chat and asks one question → officer replies.
6. *(AI)* The Ministry clicks "AI suggestion" → gets a summary and a draft decision → edits and submits → the project **re-enters with HIGH priority** at the top of the inbox.
7. **Site Execution project** → AI delay card: "Likely 23 days late, 3 missed weekly reports, monsoon" → suggested actions.
8. Close with the Ministry dashboard: escalations, bottleneck desks, district overview.

---

## 9. Out of Scope (say this to the judges)
Real integration with nProcure, IWDMS/e-Sarkar, PFMS or e-MB; payments; Aadhaar/eSign; offline mobile sync; GIS maps; multi-state setup. All of these are shown as **integration points** in the architecture.

## 10. Assumptions to Validate
- The stage sequence and the owners of each stage (simplified from CPWD Works Manual Ch. 2; check against the Gujarat PWD Manual and the delegation-of-powers orders).
- Default SLA days per stage.
- The re-entry stage is chosen by the Ministry in its decision.
- A project is frozen while escalated.

---

## Appendix A — `CLAUDE.md` (put in the repo root)

```markdown
# CLAUDE.md — PWFTS

## Project
Public Works File Tracking & Project Monitoring System (hackathon). Full plan: docs/DEVELOPMENT_PLAN.md.
Domain rules R1–R8 in Section 1 of the plan are the source of truth. Never violate them.

## Stack
Next.js App Router + TypeScript, Tailwind + shadcn/ui, Supabase (Postgres, Auth, Storage, Realtime), Zod, Vitest, Playwright. Deployed on Vercel.

## Rules for the agent
- Work ONE phase at a time. Do not start the next phase unless asked.
- All workflow state changes go through Postgres RPC functions (supabase/migrations). Never write workflow tables directly from the client.
- Use now_app() instead of now() in SQL (demo clock).
- file_movements, chat_messages and decisions are append-only.
- Keep /lib/workflow pure and unit tested. Write tests before implementing workflow logic.
- Server-only secrets: SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY.
- After each task: run `npm run lint`, `npm run build` and `npm test`, and fix failures before reporting.
- At the end of a phase, print the acceptance checklist with pass/fail.
- Keep UI consistent: shadcn components, status colours green/amber/red, HIGH priority badge.

## Commands
npm run dev | npm run build | npm run lint | npm test | npm run db:reset
```

## Appendix B — References
- CPWD Works Manual (Ch. 2: Administrative Approval, Expenditure Sanction, Technical Sanction, Availability of Funds)
- CPWA Code (Measurement Book, Running Account Bills)
- CPWD Works Manual 2022 (e-MB on PFMS; no TS for EPC contracts)
- MoSPI PAIMANA portal (national infrastructure project monitoring)
