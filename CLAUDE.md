# CLAUDE.md — PWFTS

## Project
Public Works File Tracking & Project Monitoring System (hackathon). Full plan: `docs/DEVELOPMENT_PLAN.md`.
Domain rules R1–R8 in Section 1 of the plan are the source of truth. Never violate them.

## Stack as built
Next.js 16 App Router + TypeScript, Tailwind v4, hand-written shadcn-style primitives in
`src/components/ui`, Zod, Recharts, Vitest, Playwright (+ axe-core). The data layer is a local JSON store in `src/lib/db`
shaped like the Supabase RPCs, so the swap to Postgres replaces function bodies only.
SQL for that swap is already written in `supabase/migrations`.

## Rules for the agent
- Work ONE phase at a time. Do not start the next phase unless asked.
- All workflow state changes go through the `fn_*` functions in `src/lib/db/rpc.ts`
  (and their SQL twins in `supabase/migrations/0003_functions.sql`). Never mutate the
  store from a page or a client component.
- Use `nowApp()` instead of `new Date()` in anything SLA-related, and `now_app()` in SQL.
  The demo clock depends on it.
- `file_movements`, `chat_messages` and `decisions` are append-only.
- Keep `src/lib/workflow` pure (no I/O, no React) and unit tested. Write tests first.
- Server-only secrets: `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`.
- After each task run `npm run lint`, `npm run build` and `npm test`, and fix failures
  before reporting.
- At the end of a phase, print the acceptance checklist with pass/fail.
- Keep the UI consistent: the primitives in `src/components/ui`, status colours
  green/amber/red, HIGH priority badge.

## Commands
`npm run dev` | `npm run build` | `npm run lint` | `npm test` | `npm run test:e2e` |
`npm run db:reset`

## UI invariants worth keeping
- Muted text is `text-slate-600` or darker: `slate-400`/`slate-500` fail contrast on the
  grey page background, and `e2e/accessibility.spec.ts` will catch it.
- Grid items that contain a wide table need `min-w-0` (the `Card` primitive has it), and
  the table needs an `overflow-x-auto` wrapper, or the page scrolls sideways on a phone.
- Every form control goes through `Field`, which wraps it in its `<label>`; that is what
  makes the browser tests able to find fields by their visible name.
- A form that disappears after it succeeds (approve, return) must carry its confirmation
  in a redirect (`?msg=`), not in the form's own state.

## Where things live
| Concern | File |
|---|---|
| Rules R1–R5 as pure functions | `src/lib/workflow/index.ts` |
| SLA maths and colour levels | `src/lib/sla/index.ts` |
| Visibility matrix (Section 1.3) | `src/lib/rbac/index.ts` |
| Stage table (Section 1.1) | `src/lib/domain/stages.ts` |
| RPC-equivalent mutations | `src/lib/db/rpc.ts` |
| Read models for the pages | `src/lib/db/queries.ts` |
| Seed data (15 projects) | `src/lib/db/seed.ts` |
| Server actions with Zod | `src/lib/actions.ts` |
| Demo auth + role switcher | `src/lib/auth.ts` |
| Execution maths (checklist, SPI, delay) | `src/lib/execution/index.ts` |
| Dashboard roll-ups + notification feed | `src/lib/db/analytics.ts` |
| Browser tests (demo flow, mobile, a11y) | `e2e/` |
