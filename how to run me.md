# PWFTS — Public Works File Tracking & Project Monitoring System

A department head types a **Project ID** and immediately sees where the file is, who is
holding it, for how long, and why it is late. Built against `docs/DEVELOPMENT_PLAN.md`;
Phases 0–5 are implemented; Phase 6 (the AI layer) is not started.

## Documentation

| Document | What it is |
|---|---|
| **[docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md)** | The full picture: the problem, department and desk hierarchies, the nine stages, what each role sees in the first person, every feature and why it was chosen, architecture and data model, the AI layer design, demo credentials and the demo script. Diagrams render on GitHub. |
| [docs/architecture.excalidraw](docs/architecture.excalidraw) | The architecture as an editable Excalidraw drawing — open at [excalidraw.com](https://excalidraw.com) → File → Open. Regenerate with `npm run docs:diagram`. |
| [docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md) | The original phase-by-phase plan this was built against. |

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No database or credentials are needed. On first page load the app builds its seed —
5 departments, 16 desks, 3 districts, 9 demo users and 15 projects spread across all
9 stages — into `.data/pwfts.json` (git-ignored).

Sign in with any demo account below, password **`Demo@1234`**. Once inside, the
**persona switcher in the top bar** changes user without logging out — that is how you
demo eight roles in five minutes.

| Email | Role |
|---|---|
| `ministry@demo` | Ministry (CMO) |
| `finance.head@demo` | Head, Finance |
| `finance.op@demo` | Operator, Finance |
| `rb.head@demo` | Head, R&B (PWD) |
| `rb.op@demo` | Operator, R&B |
| `tender.head@demo` | Head, Tender Cell |
| `site.head@demo` | Head, Site Execution Wing |
| `site.eng@demo` | Site Engineer |
| `admin@demo` | Super Admin |

## How to check what has been built

```bash
npm test          # 55 unit tests: rules R1–R7, the execution maths, and two
                  #   full walk-throughs (demo script + Stage 1 to closure)
npm run test:e2e  # 9 Playwright tests in a real browser: the whole demo script,
                  #   phone-width layout, and an axe accessibility audit
npm run lint      # eslint, clean
npm run build     # production build, clean
npm run db:reset  # wipe the local store; the seed rebuilds on the next page load
curl http://localhost:3000/api/cron/sla   # the SLA sweep endpoint
```

`npm test` is the fastest proof the rules hold: `src/lib/db/flow.test.ts` drives the
demo script through the data layer and `src/lib/db/lifecycle.test.ts` takes one project
from Stage 1 to closure. Both assert the things that must *fail* too, such as R&B trying
to approve a Finance stage, or a site engineer approving their own extension of time.

`npm run test:e2e` starts its own dev server on port 3210, resets the demo data, and
drives the browser through create → forward → approve → return → breach → justify →
chat → decide → re-enter, asserting there are **no console errors** on the way.

> Both suites rebuild the seed, so run them **before** a demo, not during one.

### Click through it yourself (7 minutes)

1. **Ministry** → *Create Proposal* → submit. A Project ID `GJ-RB-2026-AHD-00xx`
   is generated and the passport opens at Stage 1. Approve it.
2. Switch to **finance.op@demo** → *Dept Inbox* → open the project → **Forward** it
   from the Section Officer to the Accounts Officer. Open *Movement log*: you see every
   desk hop.
3. Switch to **rb.op@demo** → same *Movement log*: the Finance desks collapse to one
   line, `With Finance Department · N days · SLA 21 days`. That is the visibility rule.
4. Switch to **finance.head@demo** → the project's *Actions* panel → open the
   **Sub-tasks** tab, close the open Planning sub-task, then **Approve**. The file moves
   to Technical Sanction. (Approving with a sub-task open is refused — rule R2.)
5. Switch to **rb.head@demo** → **Return** it to Administrative Approval with a reason.
   The passport now shows *2 attempts* on that stage and the SLA has restarted.
6. Switch to **admin@demo** → *Admin* → **+7 days** (twice if needed). The file turns
   red, an escalation opens, and forwarding is frozen.
7. As the holding officer (**finance.head@demo**) → *Escalations* → submit the
   **justification**. Switch to **ministry@demo** → **Official chat** → ask a question;
   switch back and reply. Messages cannot be edited or deleted.
8. As **ministry@demo** → **Decision** tab → record a decision with a new SLA and a
   re-entry stage. The project re-enters at that stage with **HIGH priority** and jumps
   to the top of the inbox.
9. Switch to **site.eng@demo** → *My Sites* → open a project → submit a weekly report
   **with a photo**. Progress moves on the checklist and the passport, and the missed-
   report counter updates. Request an extension of time; switch to **site.head@demo**
   to approve it — the Site Execution due date moves and the movement log records it.
10. On a late-stage project, the **completion report** pre-fills its own delay days and
    reasons from the SLA overruns, escalations and approved extensions. Finance settles
    the final bill, then the DLP countdown has to finish before *Close project* works.
11. *Admin → Reset demo data* puts everything back.

## What is implemented

| Plan phase | Status |
|---|---|
| Phase 0 — setup, layout, all routes | done |
| Phase 1 — data model, auth, RBAC, seed | done (local store; SQL written for Supabase) |
| Phase 2 — workflow engine, passport, inbox | done |
| Phase 3 — SLA, escalation, chat, decision, demo clock | done |
| Phase 4 — execution, completion, final bill, DLP | done |
| Phase 5 — dashboards, notifications, polish, E2E | done |
| Phase 6 — AI layer | not started |

## Architecture

```
src/lib/workflow     pure state machine (R1–R5), no I/O — unit tested
src/lib/sla          SLA maths, amber at 75%, red past due
src/lib/execution    checklist template, planned-vs-actual, SPI, report
                     compliance, delay attribution — all pure, all tested
src/lib/rbac         the visibility matrix from Section 1.3
src/lib/db/rpc.ts    the only place workflow state changes (fn_* functions)
src/lib/db/queries   read models for the pages
src/lib/db/analytics dashboard roll-ups and the derived notification feed
src/lib/db/store     JSON persistence + now_app() demo clock
src/lib/actions.ts   server actions, Zod-validated, one per RPC
supabase/            migrations + RLS + the same functions in plpgsql
e2e/                 Playwright: demo flow, mobile layout, accessibility
```

The rules live in **one place** twice: once as pure TypeScript for the UI and the tests,
once as plpgsql for the database. Pages never mutate state directly.

### Swapping to Supabase

1. Create the project, run `supabase/migrations/*.sql` in order, then `supabase/seed.sql`.
2. Create the demo users in Auth and insert matching `profiles` rows.
3. Replace the bodies of `src/lib/db/rpc.ts` and `src/lib/db/queries.ts` with
   `supabase.rpc(...)` / `supabase.from(...)` calls, and `src/lib/auth.ts` with
   Supabase Auth. Nothing above those files changes.
4. Schedule the sweep: `select cron.schedule('pwfts-sla-sweep', '*/10 * * * *',
   $$select fn_sla_sweep()$$);` and/or point a Vercel Cron at `/api/cron/sla` with
   `CRON_SECRET` set.

## Known limits

- The local store is a single JSON file, fine for one demo machine, not for concurrent
  users or a read-only serverless filesystem — deploying to Vercel needs the Supabase
  swap above.
- Chat updates by polling every 5 seconds while the tab is open, not Supabase Realtime.
- Report photos are written to `public/uploads/`, which works locally but needs the
  Supabase Storage swap before hosting.
- Notifications are derived on each page load rather than stored and marked read.
- Accessibility is verified with axe-core (no serious or critical violations on the main
  pages) rather than a Lighthouse score.
- Sign-in compares against a fixed demo password; there is no password hashing yet.

