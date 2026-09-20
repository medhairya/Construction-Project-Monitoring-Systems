-- Workflow functions — Section 4.3. The rules R1-R7 live here, and are
-- mirrored in pure TypeScript in src/lib/workflow for the UI and unit tests.
--
-- Every function takes the acting profile id explicitly rather than reading
-- auth.uid(). The app signs demo users in with its own cookie session
-- (DEMO_MODE) and calls these through the secret key, so there is no Supabase
-- JWT to read. The checks are identical either way; only the source of the
-- actor differs. When real Supabase Auth is introduced, pass auth.uid() as
-- p_actor and the bodies need no change.
--
-- Every statement here is CREATE OR REPLACE, so this file is safe to re-apply:
-- it is the single source of truth for the functions rather than a one-way
-- migration. `npm run db:push -- --redo 0003_functions.sql` reapplies it.

create or replace function fn_role_of(p_actor uuid) returns role_type
language sql stable security definer set search_path = public as $$
  select role from profiles where id = p_actor;
$$;

create or replace function fn_dept_of(p_actor uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select department_id from profiles where id = p_actor;
$$;

create or replace function fn_desk_of(p_actor uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select desk_id from profiles where id = p_actor;
$$;

create or replace function fn_sla_days(p_project uuid, p_stage stage_key) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sla_days from project_sla_overrides where project_id = p_project and stage_key = p_stage),
    (select default_sla_days from stage_definitions where key = p_stage));
$$;

/**
 * Opens a stage instance, points the project at it, and logs the arrival.
 * Entering Site Execution also lays down the execution checklist (Phase 4).
 */
create or replace function fn_open_stage_instance(
  p_project uuid, p_stage stage_key, p_sla int, p_via entered_via, p_actor uuid, p_remark text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_attempt int;
  v_desk uuid;
  v_instance uuid;
  v_started timestamptz := now_app();
  v_item record;
  v_offset int := 0;
  v_span int;
begin
  select coalesce(max(attempt_no), 0) + 1 into v_attempt
    from stage_instances where project_id = p_project and stage_key = p_stage;

  select d.id into v_desk
    from desks d
    join stage_definitions sd on sd.owner_department_id = d.department_id
   where sd.key = p_stage
   order by d.designation
   limit 1;

  insert into stage_instances (project_id, stage_key, attempt_no, status, started_at,
                               due_at, sla_days, entered_via, holder_desk_id)
  values (p_project, p_stage, v_attempt, 'ACTIVE', v_started,
          v_started + p_sla * interval '1 day', p_sla, p_via, v_desk)
  returning id into v_instance;

  update projects
     set current_stage_key = p_stage, current_stage_instance_id = v_instance
   where id = p_project;

  insert into file_movements (project_id, stage_instance_id, action, to_desk_id, actor_id, remark)
  values (p_project, v_instance,
          -- The CASE has to be cast: its branches are text, the column is an enum.
          (case when p_via = 'REENTRY' then 'REENTERED' else 'RECEIVED' end)::movement_action,
          v_desk, p_actor, p_remark);

  -- Phase 4 task 1: the checklist template, spread across the stage SLA.
  if p_stage = 'SITE_EXECUTION'
     and not exists (select 1 from execution_checklist_items where project_id = p_project) then
    for v_item in
      select * from (values
        ('Site clearance & setting out', 10),
        ('Foundation & sub-structure', 25),
        ('Structure / pavement layers', 35),
        ('Finishing & services', 20),
        ('Handover & snag clearing', 10)
      ) as t(title, weight)
    loop
      v_span := greatest(1, round(p_sla * v_item.weight / 100.0));
      insert into execution_checklist_items
        (project_id, title, planned_start, planned_end, weight_pct, actual_pct, status)
      values (p_project, v_item.title,
              (v_started + v_offset * interval '1 day')::date,
              (v_started + (v_offset + v_span) * interval '1 day')::date,
              v_item.weight, 0, 'NOT_STARTED');
      v_offset := v_offset + v_span;
    end loop;

    update projects
       set assigned_site_engineer_id = coalesce(
             assigned_site_engineer_id,
             (select id from profiles where role = 'SITE_ENGINEER' limit 1))
     where id = p_project;
  end if;

  return v_instance;
end;
$$;

-- R5: the Project ID is generated only here, at Stage 1.
create or replace function fn_create_project(
  p_actor uuid, p_title text, p_description text, p_district uuid, p_cost numeric,
  p_sla_overrides jsonb default '{}'::jsonb
) returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_district text;
  v_seq int;
  v_code text;
  v_project projects;
  v_key text;
begin
  if fn_role_of(p_actor) not in ('MINISTRY','SUPER_ADMIN') then
    raise exception 'Only the Ministry can create a project proposal.';
  end if;

  select code into v_district from districts where id = p_district;
  if v_district is null then raise exception 'Unknown district.'; end if;

  select count(*) + 1 into v_seq from projects
   where extract(year from created_at) = extract(year from now_app());

  v_code := 'GJ-RB-' || to_char(now_app(), 'YYYY') || '-' || v_district || '-' ||
            lpad(v_seq::text, 4, '0');

  insert into projects (project_code, title, description, district_id, sanctioned_cost,
                        current_stage_key, created_by, created_at)
  values (v_code, p_title, p_description, p_district, p_cost, 'MINISTRY_PROPOSAL',
          p_actor, now_app())
  returning * into v_project;

  for v_key in select jsonb_object_keys(p_sla_overrides) loop
    insert into project_sla_overrides (project_id, stage_key, sla_days)
    values (v_project.id, v_key::stage_key, (p_sla_overrides ->> v_key)::int);
  end loop;

  perform fn_open_stage_instance(
    v_project.id, 'MINISTRY_PROPOSAL',
    fn_sla_days(v_project.id, 'MINISTRY_PROPOSAL'),
    'FORWARD', p_actor, 'Proposal created. Project ID ' || v_code || ' generated.');

  select * into v_project from projects where id = v_project.id;
  return v_project;
end;
$$;

/** Shared guard for the two stage transitions: R1, R2, R3 and the R7 freeze. */
create or replace function fn_assert_can_decide_stage(p_actor uuid, p_project uuid)
returns stage_instances
language plpgsql security definer set search_path = public as $$
declare
  v_project projects;
  v_inst stage_instances;
  v_owner uuid;
  v_open int;
  v_role role_type := fn_role_of(p_actor);
begin
  select * into v_project from projects where id = p_project;
  if v_project.id is null then raise exception 'Unknown project.'; end if;

  if v_project.status = 'ESCALATED' then
    raise exception 'Project is escalated - movement is frozen until the Ministry decides.';
  end if;
  if v_project.status in ('COMPLETED','CANCELLED') then
    raise exception 'Project is closed.';
  end if;

  select * into v_inst from stage_instances where id = v_project.current_stage_instance_id;
  if v_inst.id is null then raise exception 'No active stage instance.'; end if;

  select owner_department_id into v_owner from stage_definitions where key = v_inst.stage_key;
  if not (v_role = 'DEPT_HEAD' and fn_dept_of(p_actor) = v_owner)
     and not (v_role = 'MINISTRY'
              and v_owner = (select id from departments where code = 'MIN')) then
    raise exception 'Only the head of the owning department can decide this stage.';
  end if;

  select count(*) into v_open from subtasks
   where stage_instance_id = v_inst.id and status = 'OPEN';
  if v_open > 0 then
    raise exception '% sub-task(s) still open in this stage.', v_open;
  end if;

  return v_inst;
end;
$$;

-- R1, R2, R3.
create or replace function fn_approve_stage(
  p_actor uuid, p_project uuid, p_remark text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inst stage_instances;
  v_next stage_key;
begin
  v_inst := fn_assert_can_decide_stage(p_actor, p_project);

  update stage_instances set status = 'APPROVED', ended_at = now_app() where id = v_inst.id;
  insert into file_movements (project_id, stage_instance_id, action, from_desk_id, actor_id, remark)
  values (p_project, v_inst.id, 'APPROVED', v_inst.holder_desk_id, p_actor,
          coalesce(nullif(p_remark, ''), 'Approved.'));

  select key into v_next from stage_definitions
   where seq = (select seq + 1 from stage_definitions where key = v_inst.stage_key);

  if v_next is null then
    update projects set status = 'COMPLETED' where id = p_project;
  else
    perform fn_open_stage_instance(p_project, v_next, fn_sla_days(p_project, v_next),
                                   'FORWARD', p_actor, 'File received.');
  end if;
end;
$$;

-- R4: returns go backwards only, with a mandatory reason and a fresh SLA.
create or replace function fn_return_stage(
  p_actor uuid, p_project uuid, p_target stage_key, p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inst stage_instances;
begin
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'A reason is mandatory when returning a file.';
  end if;

  v_inst := fn_assert_can_decide_stage(p_actor, p_project);

  if (select seq from stage_definitions where key = p_target)
     >= (select seq from stage_definitions where key = v_inst.stage_key) then
    raise exception 'A file can only be returned to an earlier stage.';
  end if;

  update stage_instances set status = 'RETURNED', ended_at = now_app() where id = v_inst.id;
  insert into file_movements (project_id, stage_instance_id, action, from_desk_id, actor_id, remark)
  values (p_project, v_inst.id, 'RETURNED', v_inst.holder_desk_id, p_actor, p_reason);

  perform fn_open_stage_instance(p_project, p_target, fn_sla_days(p_project, p_target),
                                 'RETURN', p_actor, 'Returned: ' || p_reason);
end;
$$;

-- Desk-to-desk movement inside the actor's own department.
create or replace function fn_forward_file(
  p_actor uuid, p_project uuid, p_to_desk uuid, p_remark text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_project projects;
  v_inst stage_instances;
  v_owner uuid;
  v_from uuid;
  v_dept uuid := fn_dept_of(p_actor);
  v_desk_dept uuid;
begin
  select * into v_project from projects where id = p_project;
  if v_project.id is null then raise exception 'Unknown project.'; end if;
  if v_project.status = 'ESCALATED' then
    raise exception 'File movement is frozen while the project is escalated.';
  end if;
  if v_project.status in ('COMPLETED','CANCELLED') then
    raise exception 'Project is closed.';
  end if;
  if fn_role_of(p_actor) not in ('DEPT_HEAD','DEPT_OPERATOR') then
    raise exception 'Only department heads and operators can forward a file.';
  end if;

  select department_id into v_desk_dept from desks where id = p_to_desk;
  if v_desk_dept is null then raise exception 'Unknown desk.'; end if;
  if v_desk_dept <> v_dept then
    raise exception 'You can only forward the file inside your own department.';
  end if;

  select * into v_inst from stage_instances where id = v_project.current_stage_instance_id;
  select owner_department_id into v_owner from stage_definitions where key = v_inst.stage_key;
  if v_owner <> v_dept then
    raise exception 'The file is not with your department at this stage.';
  end if;

  v_from := v_inst.holder_desk_id;
  update stage_instances set holder_desk_id = p_to_desk where id = v_inst.id;
  insert into file_movements (project_id, stage_instance_id, action, from_desk_id, to_desk_id,
                              actor_id, remark)
  values (p_project, v_inst.id, 'FORWARDED', v_from, p_to_desk, p_actor,
          coalesce(nullif(p_remark, ''), 'Forwarded.'));
end;
$$;

-- R2: parallel work inside one stage.
create or replace function fn_open_subtask(
  p_actor uuid, p_project uuid, p_desk uuid, p_title text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inst uuid;
  v_dept uuid;
begin
  select current_stage_instance_id into v_inst from projects where id = p_project;
  if v_inst is null then raise exception 'No active stage instance.'; end if;
  select department_id into v_dept from desks where id = p_desk;
  if v_dept is null then raise exception 'Unknown desk.'; end if;

  insert into subtasks (stage_instance_id, department_id, desk_id, title, status, opened_at)
  values (v_inst, v_dept, p_desk, p_title, 'OPEN', now_app());

  insert into file_movements (project_id, stage_instance_id, action, to_desk_id, actor_id, remark)
  values (p_project, v_inst, 'SUBTASK_OPENED', p_desk, p_actor, 'Sub-task opened: ' || p_title);
end;
$$;

create or replace function fn_close_subtask(p_actor uuid, p_subtask uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_st subtasks;
  v_inst stage_instances;
begin
  select * into v_st from subtasks where id = p_subtask;
  if v_st.id is null then raise exception 'Unknown sub-task.'; end if;

  update subtasks set status = 'CLOSED', closed_at = now_app() where id = p_subtask;
  select * into v_inst from stage_instances where id = v_st.stage_instance_id;

  insert into file_movements (project_id, stage_instance_id, action, from_desk_id, to_desk_id,
                              actor_id, remark)
  values (v_inst.project_id, v_inst.id, 'SUBTASK_CLOSED', v_st.desk_id, v_inst.holder_desk_id,
          p_actor, 'Sub-task closed: ' || v_st.title);
end;
$$;

-- R7.1 — called by pg_cron, by /api/cron/sla, and on page load.
create or replace function fn_sla_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_inst stage_instances;
  v_count int := 0;
begin
  for v_inst in
    select si.* from stage_instances si
      join projects p on p.id = si.project_id
     where si.status = 'ACTIVE'
       and si.due_at < now_app()
       and p.status not in ('COMPLETED','CANCELLED')
  loop
    update stage_instances set status = 'BREACHED' where id = v_inst.id;
    update projects set status = 'ESCALATED' where id = v_inst.project_id;

    if not exists (select 1 from escalations where stage_instance_id = v_inst.id) then
      insert into escalations (project_id, stage_instance_id, breached_at, status)
      values (v_inst.project_id, v_inst.id, v_inst.due_at, 'AWAITING_JUSTIFICATION');

      insert into file_movements (project_id, stage_instance_id, action, from_desk_id, remark)
      values (v_inst.project_id, v_inst.id, 'ESCALATED', v_inst.holder_desk_id,
              'SLA breached - escalated to the Ministry. Forward movement frozen.');
    end if;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- R7.2 / R7.3 — the structured justification, then the Ministry review.
create or replace function fn_submit_justification(
  p_actor uuid, p_escalation uuid, p_cause breach_cause, p_explanation text,
  p_impact text, p_proposed_fix text, p_new_eta date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_esc escalations;
begin
  select * into v_esc from escalations where id = p_escalation;
  if v_esc.id is null then raise exception 'Unknown escalation.'; end if;
  if v_esc.status = 'DECIDED' then
    raise exception 'This escalation has already been decided.';
  end if;

  insert into justifications (escalation_id, submitted_by, cause, explanation, impact,
                              proposed_fix, new_eta, created_at)
  values (p_escalation, p_actor, p_cause, p_explanation, p_impact, p_proposed_fix,
          p_new_eta, now_app());

  update escalations set status = 'UNDER_REVIEW' where id = p_escalation;

  if not exists (select 1 from chat_threads where escalation_id = p_escalation) then
    insert into chat_threads (escalation_id, created_by, created_at)
    values (p_escalation, p_actor, now_app());
  end if;
end;
$$;

-- R7.4 — the official chat. Append-only: there is no update or delete path.
create or replace function fn_post_chat_message(
  p_actor uuid, p_escalation uuid, p_body text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_thread uuid;
begin
  select id into v_thread from chat_threads where escalation_id = p_escalation;
  if v_thread is null then
    insert into chat_threads (escalation_id, created_by, created_at)
    values (p_escalation, p_actor, now_app())
    returning id into v_thread;
  end if;

  insert into chat_messages (thread_id, sender_id, body, created_at)
  values (v_thread, p_actor, p_body, now_app());
end;
$$;

-- R7.5 / R7.6 — the decision, the re-entry, HIGH priority and the new SLA.
create or replace function fn_record_decision(
  p_actor uuid, p_escalation uuid, p_type decision_type, p_changes text, p_reason text,
  p_new_sla int, p_reentry stage_key, p_priority priority_level default 'HIGH'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_esc escalations;
begin
  if fn_role_of(p_actor) <> 'MINISTRY' then
    raise exception 'Only the Ministry can record an escalation decision.';
  end if;

  select * into v_esc from escalations where id = p_escalation;
  if v_esc.id is null then raise exception 'Unknown escalation.'; end if;
  if v_esc.status = 'DECIDED' then
    raise exception 'A decision is already on record.';
  end if;

  insert into decisions (escalation_id, decided_by, decision_type, changes_ordered, reason,
                         new_sla_days, reentry_stage_key, priority, created_at)
  values (p_escalation, p_actor, p_type, p_changes, p_reason, p_new_sla, p_reentry,
          p_priority, now_app());

  update escalations set status = 'DECIDED' where id = p_escalation;
  update stage_instances set status = 'RETURNED', ended_at = now_app()
   where id = v_esc.stage_instance_id;

  if p_type = 'CANCEL_PROJECT' then
    update projects set status = 'CANCELLED' where id = v_esc.project_id;
    insert into file_movements (project_id, stage_instance_id, action, actor_id, remark)
    values (v_esc.project_id, v_esc.stage_instance_id, 'NOTE', p_actor,
            'Project cancelled by Ministry decision: ' || p_reason);
    return;
  end if;

  update projects set status = 'ACTIVE', priority = p_priority where id = v_esc.project_id;
  perform fn_open_stage_instance(
    v_esc.project_id, p_reentry, p_new_sla, 'REENTRY', p_actor,
    'Re-entered after the Ministry decision, priority ' || p_priority ||
    ', SLA ' || p_new_sla || ' days. ' || p_changes);
end;
$$;

-- ---------------------------------------------------------------- Phase 4 --

/** A site report also drives the checklist, so the passport progress moves. */
create or replace function fn_submit_execution_report(
  p_actor uuid, p_project uuid, p_type report_type, p_progress int,
  p_remarks text, p_issues text default '', p_photos text[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inst uuid;
  v_item execution_checklist_items;
  v_remaining numeric := p_progress;
  v_share numeric;
begin
  if fn_role_of(p_actor) not in ('SITE_ENGINEER','DEPT_HEAD') then
    raise exception 'Only the site team can submit an execution report.';
  end if;

  insert into execution_reports (project_id, report_type, submitted_by, progress_pct,
                                 remarks, issues, photo_paths, created_at)
  values (p_project, p_type, p_actor, p_progress, p_remarks, p_issues, p_photos, now_app());

  for v_item in
    select * from execution_checklist_items where project_id = p_project order by planned_start
  loop
    v_share := least(v_item.weight_pct, greatest(0, v_remaining));
    update execution_checklist_items
       set actual_pct = round(v_share / v_item.weight_pct * 100),
           status = case
                      when round(v_share / v_item.weight_pct * 100) >= 100 then 'DONE'
                      when v_share > 0 then 'IN_PROGRESS'
                      else 'NOT_STARTED' end
     where id = v_item.id;
    v_remaining := v_remaining - v_share;
  end loop;

  select current_stage_instance_id into v_inst from projects where id = p_project;
  if v_inst is not null then
    insert into file_movements (project_id, stage_instance_id, action, from_desk_id,
                                actor_id, remark)
    values (p_project, v_inst, 'NOTE', fn_desk_of(p_actor), p_actor,
            lower(p_type::text) || ' report: ' || p_progress || '% complete. ' || p_remarks);
  end if;
end;
$$;

create or replace function fn_submit_ra_bill(
  p_actor uuid, p_project uuid, p_bill_no text, p_amount numeric
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from ra_bills where project_id = p_project and bill_no = p_bill_no) then
    raise exception 'A bill with this number already exists for this project.';
  end if;
  insert into ra_bills (project_id, bill_no, amount, submitted_at, status)
  values (p_project, p_bill_no, p_amount, now_app(), 'SUBMITTED');
end;
$$;

/** Submitted -> verified by the department head -> paid by Finance. */
create or replace function fn_advance_ra_bill(p_actor uuid, p_bill uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_bill ra_bills;
  v_role role_type := fn_role_of(p_actor);
begin
  select * into v_bill from ra_bills where id = p_bill;
  if v_bill.id is null then raise exception 'Unknown bill.'; end if;

  if v_bill.status = 'SUBMITTED' then
    if v_role not in ('DEPT_HEAD','MINISTRY') then
      raise exception 'Only a department head can verify a running account bill.';
    end if;
    update ra_bills set status = 'VERIFIED' where id = p_bill;
  elsif v_bill.status = 'VERIFIED' then
    if fn_dept_of(p_actor) is distinct from (select id from departments where code = 'FIN')
       and v_role <> 'SUPER_ADMIN' then
      raise exception 'Only Finance can mark a bill paid.';
    end if;
    update ra_bills set status = 'PAID', paid_at = now_app() where id = p_bill;
  else
    raise exception 'This bill is already paid.';
  end if;
end;
$$;

create or replace function fn_request_eot(
  p_actor uuid, p_project uuid, p_days int, p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into eot_requests (project_id, days_requested, reason, status, decided_by)
  values (p_project, p_days, p_reason, 'PENDING', null);
end;
$$;

/** An approved extension moves the live Site Execution due date, and is logged. */
create or replace function fn_decide_eot(p_actor uuid, p_eot uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_eot eot_requests;
  v_inst stage_instances;
begin
  select * into v_eot from eot_requests where id = p_eot;
  if v_eot.id is null then raise exception 'Unknown EoT request.'; end if;
  if v_eot.status <> 'PENDING' then raise exception 'This request has already been decided.'; end if;
  if fn_role_of(p_actor) not in ('DEPT_HEAD','MINISTRY') then
    raise exception 'Only the Executive Engineer (department head) can decide an EoT.';
  end if;

  update eot_requests
     set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
         decided_by = p_actor
   where id = p_eot;

  if not p_approve then return; end if;

  select si.* into v_inst
    from stage_instances si join projects p on p.current_stage_instance_id = si.id
   where p.id = v_eot.project_id;

  if v_inst.id is null or v_inst.stage_key <> 'SITE_EXECUTION' then
    raise exception 'An extension of time applies only while the project is in Site Execution.';
  end if;

  update stage_instances
     set due_at = due_at + v_eot.days_requested * interval '1 day',
         sla_days = sla_days + v_eot.days_requested,
         status = case when status = 'BREACHED'
                        and due_at + v_eot.days_requested * interval '1 day' > now_app()
                       then 'ACTIVE' else status end
   where id = v_inst.id;

  insert into file_movements (project_id, stage_instance_id, action, actor_id, remark)
  values (v_eot.project_id, v_inst.id, 'NOTE', p_actor,
          'Extension of time approved: ' || v_eot.days_requested ||
          ' days. Reason: ' || v_eot.reason);
end;
$$;

create or replace function fn_submit_completion_report(
  p_actor uuid, p_project uuid, p_summary text, p_total_billed numeric, p_dues numeric,
  p_problems text, p_delay_days int, p_delay_reasons text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inst uuid;
begin
  if exists (select 1 from completion_reports where project_id = p_project) then
    raise exception 'A completion report is already on record for this project.';
  end if;

  insert into completion_reports (project_id, work_done_summary, total_billed, dues,
                                  problems_faced, delay_days, delay_reasons, signed_by, ai_drafted)
  values (p_project, p_summary, p_total_billed, p_dues, p_problems, p_delay_days,
          p_delay_reasons, p_actor, false);

  select current_stage_instance_id into v_inst from projects where id = p_project;
  if v_inst is not null then
    insert into file_movements (project_id, stage_instance_id, action, from_desk_id,
                                actor_id, remark)
    values (p_project, v_inst, 'NOTE', fn_desk_of(p_actor), p_actor,
            'Completion report signed.');
  end if;
end;
$$;

create or replace function fn_settle_final_bill(p_actor uuid, p_project uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inst uuid;
  v_stage stage_key;
begin
  if fn_dept_of(p_actor) is distinct from (select id from departments where code = 'FIN')
     and fn_role_of(p_actor) <> 'SUPER_ADMIN' then
    raise exception 'Only Finance can settle the final bill.';
  end if;

  select current_stage_key, current_stage_instance_id into v_stage, v_inst
    from projects where id = p_project;
  if v_stage <> 'FINAL_BILL' then
    raise exception 'The project is not at the Final Bill stage.';
  end if;

  update ra_bills set status = 'PAID', paid_at = now_app()
   where project_id = p_project and status <> 'PAID';

  insert into file_movements (project_id, stage_instance_id, action, from_desk_id,
                              actor_id, remark)
  values (p_project, v_inst, 'NOTE', fn_desk_of(p_actor), p_actor,
          'Final bill settled. All dues cleared.');
end;
$$;

/** DLP: the countdown has to finish before the project can be closed. */
create or replace function fn_close_project(p_actor uuid, p_project uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_inst stage_instances;
  v_stage stage_key;
begin
  select current_stage_key into v_stage from projects where id = p_project;
  if v_stage <> 'DLP_CLOSURE' then
    raise exception 'A project can only be closed at the Defect Liability stage.';
  end if;

  v_inst := fn_assert_can_decide_stage(p_actor, p_project);

  if v_inst.due_at > now_app() then
    raise exception 'The defect liability period has not finished yet.';
  end if;

  update stage_instances set status = 'APPROVED', ended_at = now_app() where id = v_inst.id;
  update projects set status = 'COMPLETED' where id = p_project;

  insert into file_movements (project_id, stage_instance_id, action, from_desk_id,
                              actor_id, remark)
  values (p_project, v_inst.id, 'APPROVED', v_inst.holder_desk_id, p_actor,
          'Defect liability period completed. Project closed.');
end;
$$;

-- ------------------------------------------------------------ demo clock --

create or replace function fn_shift_clock(p_days int) returns int
language sql security definer set search_path = public as $$
  update system_clock set offset_minutes = offset_minutes + p_days * 24 * 60
   where id = 1
  returning offset_minutes;
$$;

create or replace function fn_set_clock(p_minutes int) returns int
language sql security definer set search_path = public as $$
  update system_clock set offset_minutes = p_minutes where id = 1
  returning offset_minutes;
$$;

-- Schedule the sweep every 10 minutes (plan Section 2). Needs pg_cron, which
-- is enabled from Database -> Extensions in the Supabase dashboard.
-- select cron.schedule('pwfts-sla-sweep', '*/10 * * * *', $$select fn_sla_sweep()$$);
