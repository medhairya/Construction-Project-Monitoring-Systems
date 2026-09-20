-- RLS — Section 4.4. Mirrors src/lib/rbac/index.ts.
-- All workflow writes go through the SECURITY DEFINER functions in 0003, so
-- direct insert/update is revoked on the workflow tables.
--
-- How this is reached today: the app holds its own demo cookie session and
-- talks to Postgres with the secret key from the server, which bypasses RLS.
-- The rules that actually gate a request are therefore the ones in
-- src/lib/rbac and the guards inside the 0003 functions. These policies still
-- matter for two reasons:
--   1. They deny everything to the anon/publishable key, so the key that ships
--      to the browser can read nothing at all.
--   2. They are the enforcement path the moment real Supabase Auth is turned
--      on, with no rewrite needed.
-- The auth.uid() below is null under the demo session, which is what makes (1)
-- true: no row matches, so nothing is readable without the secret key.

create or replace function my_role() returns role_type
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function my_department() returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from profiles where id = auth.uid();
$$;

create or replace function department_of_desk(d uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from desks where id = d;
$$;

alter table departments            enable row level security;
alter table desks                  enable row level security;
alter table profiles               enable row level security;
alter table districts              enable row level security;
alter table stage_definitions      enable row level security;
alter table projects               enable row level security;
alter table project_sla_overrides  enable row level security;
alter table stage_instances        enable row level security;
alter table subtasks               enable row level security;
alter table file_movements         enable row level security;
alter table escalations            enable row level security;
alter table justifications         enable row level security;
alter table chat_threads           enable row level security;
alter table chat_messages          enable row level security;
alter table decisions              enable row level security;
alter table execution_reports      enable row level security;
alter table execution_checklist_items enable row level security;
alter table system_clock           enable row level security;

-- Reference data: readable by everyone signed in.
create policy read_departments on departments for select to authenticated using (true);
create policy read_desks       on desks       for select to authenticated using (true);
create policy read_districts   on districts   for select to authenticated using (true);
create policy read_stagedefs   on stage_definitions for select to authenticated using (true);
create policy read_profiles    on profiles    for select to authenticated using (true);
create policy read_clock       on system_clock for select to authenticated using (true);
create policy admin_clock      on system_clock for update to authenticated
  using (my_role() = 'SUPER_ADMIN') with check (my_role() = 'SUPER_ADMIN');

-- Projects and stage timeline: visible to everyone; site engineers see only
-- the projects assigned to them.
create policy read_projects on projects for select to authenticated using (
  my_role() <> 'SITE_ENGINEER' or assigned_site_engineer_id = auth.uid()
);
create policy read_stage_instances on stage_instances for select to authenticated using (
  exists (select 1 from projects p where p.id = project_id)
);
create policy read_sla_overrides on project_sla_overrides for select to authenticated using (true);

-- Desk-level detail: own department only, or Ministry / Super Admin.
create policy read_movements on file_movements for select to authenticated using (
  my_role() in ('MINISTRY','SUPER_ADMIN')
  or department_of_desk(from_desk_id) = my_department()
  or department_of_desk(to_desk_id) = my_department()
);
create policy read_subtasks on subtasks for select to authenticated using (
  my_role() in ('MINISTRY','SUPER_ADMIN') or department_id = my_department()
);

-- Escalations and their artefacts.
create policy read_escalations on escalations for select to authenticated using (true);
create policy read_justifications on justifications for select to authenticated using (true);
create policy read_threads on chat_threads for select to authenticated using (true);
create policy read_messages on chat_messages for select to authenticated using (true);
create policy write_messages on chat_messages for insert to authenticated
  with check (sender_id = auth.uid());
-- No update and no delete policy: chat messages are append-only (R8).

create policy read_decisions on decisions for select to authenticated using (true);
create policy write_decisions on decisions for insert to authenticated
  with check (my_role() = 'MINISTRY' and decided_by = auth.uid());
-- No update and no delete policy: decisions are append-only (R8).

create policy read_reports on execution_reports for select to authenticated using (true);
create policy write_reports on execution_reports for insert to authenticated
  with check (my_role() = 'SITE_ENGINEER' and submitted_by = auth.uid());
create policy read_checklist on execution_checklist_items for select to authenticated using (true);

-- Workflow tables are written only by the RPC functions.
revoke insert, update, delete on projects, stage_instances, file_movements,
  subtasks, escalations, justifications, chat_threads, decisions
  from authenticated;
