-- PWFTS schema — Section 4.1 / 4.2 of docs/DEVELOPMENT_PLAN.md.
-- Mirrors src/lib/domain/types.ts, which the local JSON store uses today.

-- 4.1 Enums ---------------------------------------------------------------
create type role_type as enum ('MINISTRY','DEPT_HEAD','DEPT_OPERATOR','SITE_ENGINEER','SUPER_ADMIN');
create type stage_key as enum (
  'MINISTRY_PROPOSAL','ADMIN_APPROVAL','TECH_SANCTION','TENDER','WORK_ORDER',
  'SITE_EXECUTION','COMPLETION_REPORT','FINAL_BILL','DLP_CLOSURE');
create type project_status as enum ('ACTIVE','ESCALATED','COMPLETED','CANCELLED');
create type priority_level as enum ('NORMAL','HIGH');
create type stage_status as enum ('ACTIVE','APPROVED','RETURNED','BREACHED');
create type movement_action as enum (
  'RECEIVED','FORWARDED','SUBTASK_OPENED','SUBTASK_CLOSED','APPROVED','RETURNED',
  'ESCALATED','REENTERED','NOTE');
create type breach_cause as enum (
  'DOCUMENTS_PENDING','FUNDS_UNAVAILABLE','TECHNICAL_ISSUE','CONTRACTOR_DELAY',
  'LAND_OR_CLEARANCE','WEATHER','STAFF_SHORTAGE','OTHER');
create type decision_type as enum (
  'APPROVE_WITH_NEW_SLA','ORDER_CHANGES','RETURN_TO_STAGE','CANCEL_PROJECT');
create type report_type as enum ('DAILY','WEEKLY','MONTHLY');
create type escalation_status as enum ('AWAITING_JUSTIFICATION','UNDER_REVIEW','DECIDED');
create type entered_via as enum ('FORWARD','RETURN','REENTRY');
create type subtask_status as enum ('OPEN','CLOSED');

-- Demo clock --------------------------------------------------------------
create table system_clock (
  id int primary key default 1 check (id = 1),
  offset_minutes int not null default 0
);
insert into system_clock (id, offset_minutes) values (1, 0);

-- Use now_app() everywhere instead of now(), so the demo clock moves the
-- whole system (plan Section 4.3).
create or replace function now_app() returns timestamptz
language sql stable as $$
  select now() + (select offset_minutes from system_clock where id = 1) * interval '1 minute';
$$;

-- 4.2 Tables --------------------------------------------------------------
create table departments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null
);

create table desks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id),
  designation text not null,
  officer_name text not null,
  phone text,
  email text
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  role role_type not null,
  department_id uuid references departments(id),
  desk_id uuid references desks(id)
);

create table districts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null
);

create table stage_definitions (
  key stage_key primary key,
  seq int unique not null,
  name text not null,
  owner_department_id uuid not null references departments(id),
  default_sla_days int not null
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  project_code text unique not null,
  title text not null,
  description text,
  district_id uuid not null references districts(id),
  sanctioned_cost numeric(16,2) not null,
  status project_status not null default 'ACTIVE',
  priority priority_level not null default 'NORMAL',
  current_stage_key stage_key not null,
  current_stage_instance_id uuid,
  assigned_site_engineer_id uuid references profiles(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now_app()
);

create table project_sla_overrides (
  project_id uuid not null references projects(id) on delete cascade,
  stage_key stage_key not null,
  sla_days int not null check (sla_days > 0),
  primary key (project_id, stage_key)
);

create table stage_instances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stage_key stage_key not null,
  attempt_no int not null default 1,
  status stage_status not null default 'ACTIVE',
  started_at timestamptz not null default now_app(),
  due_at timestamptz not null,
  ended_at timestamptz,
  sla_days int not null,
  entered_via entered_via not null default 'FORWARD',
  holder_desk_id uuid references desks(id)
);
create index on stage_instances (project_id);
-- R1: at most one open stage instance per project.
create unique index one_active_stage_per_project
  on stage_instances (project_id) where ended_at is null;

create table subtasks (
  id uuid primary key default gen_random_uuid(),
  stage_instance_id uuid not null references stage_instances(id) on delete cascade,
  department_id uuid not null references departments(id),
  desk_id uuid not null references desks(id),
  title text not null,
  status subtask_status not null default 'OPEN',
  opened_at timestamptz not null default now_app(),
  closed_at timestamptz
);

-- R8: append-only.
create table file_movements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stage_instance_id uuid not null references stage_instances(id) on delete cascade,
  action movement_action not null,
  from_desk_id uuid references desks(id),
  to_desk_id uuid references desks(id),
  actor_id uuid references profiles(id),
  remark text,
  created_at timestamptz not null default now_app()
);
create index on file_movements (project_id, created_at desc);

create table escalations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  stage_instance_id uuid not null references stage_instances(id) on delete cascade unique,
  breached_at timestamptz not null,
  status escalation_status not null default 'AWAITING_JUSTIFICATION'
);

create table justifications (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references escalations(id) on delete cascade,
  submitted_by uuid not null references profiles(id),
  cause breach_cause not null,
  explanation text not null,
  impact text not null,
  proposed_fix text not null,
  new_eta date not null,
  created_at timestamptz not null default now_app()
);

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references escalations(id) on delete cascade unique,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now_app()
);

-- R8: append-only, realtime.
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now_app()
);
create index on chat_messages (thread_id, created_at);

create table decisions (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references escalations(id) on delete cascade unique,
  decided_by uuid not null references profiles(id),
  decision_type decision_type not null,
  changes_ordered text not null,
  reason text not null,
  new_sla_days int not null check (new_sla_days > 0),
  reentry_stage_key stage_key not null,
  priority priority_level not null default 'HIGH',
  created_at timestamptz not null default now_app()
);

create table execution_checklist_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  planned_start date,
  planned_end date,
  weight_pct int not null,
  actual_pct int not null default 0,
  status text not null default 'NOT_STARTED'
);

create table execution_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  report_type report_type not null,
  submitted_by uuid not null references profiles(id),
  progress_pct int not null,
  remarks text,
  issues text,
  photo_paths text[] default '{}',
  created_at timestamptz not null default now_app()
);

create table ra_bills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  bill_no text not null,
  amount numeric(16,2) not null,
  submitted_at timestamptz not null default now_app(),
  status text not null default 'SUBMITTED',
  paid_at timestamptz
);

create table eot_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  days_requested int not null,
  reason text not null,
  status text not null default 'PENDING',
  decided_by uuid references profiles(id)
);

create table completion_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  work_done_summary text,
  total_billed numeric(16,2),
  dues numeric(16,2),
  problems_faced text,
  delay_days int,
  delay_reasons text,
  signed_by uuid references profiles(id),
  ai_drafted boolean not null default false
);

create table ai_outputs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  kind text not null,
  input_hash text,
  output_json jsonb,
  model text,
  created_at timestamptz not null default now_app()
);

alter table projects
  add constraint projects_current_instance_fk
  foreign key (current_stage_instance_id) references stage_instances(id)
  deferrable initially deferred;
