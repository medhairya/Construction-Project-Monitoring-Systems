-- Workflow functions — Section 4.3. The rules R1-R7 live here, and are
-- mirrored in pure TypeScript in src/lib/workflow for the UI and unit tests.
-- Every function is SECURITY DEFINER and uses now_app().

create or replace function fn_open_stage_instance(
  p_project uuid, p_stage stage_key, p_sla int, p_via entered_via, p_actor uuid, p_remark text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_attempt int;
  v_desk uuid;
  v_instance uuid;
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
  values (p_project, p_stage, v_attempt, 'ACTIVE', now_app(),
          now_app() + p_sla * interval '1 day', p_sla, p_via, v_desk)
  returning id into v_instance;

  update projects
     set current_stage_key = p_stage, current_stage_instance_id = v_instance
   where id = p_project;

  insert into file_movements (project_id, stage_instance_id, action, to_desk_id, actor_id, remark)
  values (p_project, v_instance,
          case when p_via = 'REENTRY' then 'REENTERED' else 'RECEIVED' end,
          v_desk, p_actor, p_remark);

  return v_instance;
end;
$$;

create or replace function fn_sla_days(p_project uuid, p_stage stage_key) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select sla_days from project_sla_overrides where project_id = p_project and stage_key = p_stage),
    (select default_sla_days from stage_definitions where key = p_stage));
$$;

-- R5: the Project ID is generated only here, at Stage 1.
create or replace function fn_create_project(
  p_title text, p_description text, p_district uuid, p_cost numeric,
  p_sla_overrides jsonb default '{}'::jsonb
) returns projects
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_role role_type := my_role();
  v_district text;
  v_seq int;
  v_code text;
  v_project projects;
  v_key text;
begin
  if v_role not in ('MINISTRY','SUPER_ADMIN') then
    raise exception 'Only the Ministry can create a project proposal.';
  end if;

  select code into v_district from districts where id = p_district;
  select count(*) + 1 into v_seq from projects
   where extract(year from created_at) = extract(year from now_app());

  v_code := 'GJ-RB-' || to_char(now_app(), 'YYYY') || '-' || v_district || '-' || lpad(v_seq::text, 4, '0');

  insert into projects (project_code, title, description, district_id, sanctioned_cost,
                        current_stage_key, created_by)
  values (v_code, p_title, p_description, p_district, p_cost, 'MINISTRY_PROPOSAL', v_actor)
  returning * into v_project;

  for v_key in select jsonb_object_keys(p_sla_overrides) loop
    insert into project_sla_overrides (project_id, stage_key, sla_days)
    values (v_project.id, v_key::stage_key, (p_sla_overrides ->> v_key)::int);
  end loop;

  perform fn_open_stage_instance(
    v_project.id, 'MINISTRY_PROPOSAL',
    fn_sla_days(v_project.id, 'MINISTRY_PROPOSAL'),
    'FORWARD', v_actor, 'Proposal created. Project ID ' || v_code || ' generated.');

  select * into v_project from projects where id = v_project.id;
  return v_project;
end;
$$;

-- R1, R2, R3.
create or replace function fn_approve_stage(p_project uuid, p_remark text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_role role_type := my_role();
  v_dept uuid := my_department();
  v_project projects;
  v_inst stage_instances;
  v_owner uuid;
  v_open int;
  v_next stage_key;
begin
  select * into v_project from projects where id = p_project for update;
  select * into v_inst from stage_instances where id = v_project.current_stage_instance_id for update;

  if v_project.status = 'ESCALATED' then
    raise exception 'Project is escalated — movement is frozen until the Ministry decides.';
  end if;
  if v_project.status in ('COMPLETED','CANCELLED') then
    raise exception 'Project is closed.';
  end if;

  select owner_department_id into v_owner from stage_definitions where key = v_inst.stage_key;
  if not (v_role = 'DEPT_HEAD' and v_dept = v_owner)
     and not (v_role = 'MINISTRY' and v_owner = (select id from departments where code = 'MIN')) then
    raise exception 'Only the head of the owning department can approve this stage.';
  end if;

  select count(*) into v_open from subtasks
   where stage_instance_id = v_inst.id and status = 'OPEN';
  if v_open > 0 then
    raise exception '% sub-task(s) still open in this stage.', v_open;
  end if;

  update stage_instances set status = 'APPROVED', ended_at = now_app() where id = v_inst.id;
  insert into file_movements (project_id, stage_instance_id, action, from_desk_id, actor_id, remark)
  values (p_project, v_inst.id, 'APPROVED', v_inst.holder_desk_id, v_actor, p_remark);

  select key into v_next from stage_definitions
   where seq = (select seq + 1 from stage_definitions where key = v_inst.stage_key);

  if v_next is null then
    update projects set status = 'COMPLETED' where id = p_project;
  else
    perform fn_open_stage_instance(p_project, v_next, fn_sla_days(p_project, v_next),
                                   'FORWARD', v_actor, 'File received.');
  end if;
end;
$$;

-- R4: returns go backwards only, with a mandatory reason and a fresh SLA.
create or replace function fn_return_stage(p_project uuid, p_target stage_key, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_project projects;
  v_inst stage_instances;
  v_owner uuid;
begin
  if coalesce(length(trim(p_reason)), 0) < 5 then
    raise exception 'A reason is mandatory when returning a file.';
  end if;

  select * into v_project from projects where id = p_project for update;
  select * into v_inst from stage_instances where id = v_project.current_stage_instance_id for update;

  if v_project.status = 'ESCALATED' then
    raise exception 'Project is escalated — movement is frozen.';
  end if;

  select owner_department_id into v_owner from stage_definitions where key = v_inst.stage_key;
  if not (my_role() = 'DEPT_HEAD' and my_department() = v_owner)
     and not (my_role() = 'MINISTRY' and v_owner = (select id from departments where code = 'MIN')) then
    raise exception 'Only the head of the owning department can return this file.';
  end if;

  if (select seq from stage_definitions where key = p_target)
     >= (select seq from stage_definitions where key = v_inst.stage_key) then
    raise exception 'A file can only be returned to an earlier stage.';
  end if;

  update stage_instances set status = 'RETURNED', ended_at = now_app() where id = v_inst.id;
  insert into file_movements (project_id, stage_instance_id, action, from_desk_id, actor_id, remark)
  values (p_project, v_inst.id, 'RETURNED', v_inst.holder_desk_id, v_actor, p_reason);

  perform fn_open_stage_instance(p_project, p_target, fn_sla_days(p_project, p_target),
                                 'RETURN', v_actor, 'Returned: ' || p_reason);
end;
$$;

-- Desk-to-desk movement inside the actor's own department.
create or replace function fn_forward_file(p_project uuid, p_to_desk uuid, p_remark text default '')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_project projects;
  v_inst stage_instances;
  v_owner uuid;
  v_from uuid;
begin
  select * into v_project from projects where id = p_project for update;
  if v_project.status = 'ESCALATED' then
    raise exception 'File movement is frozen while the project is escalated.';
  end if;
  if my_role() not in ('DEPT_HEAD','DEPT_OPERATOR') then
    raise exception 'Only department heads and operators can forward a file.';
  end if;
  if department_of_desk(p_to_desk) <> my_department() then
    raise exception 'You can only forward the file inside your own department.';
  end if;

  select * into v_inst from stage_instances where id = v_project.current_stage_instance_id for update;
  select owner_department_id into v_owner from stage_definitions where key = v_inst.stage_key;
  if v_owner <> my_department() then
    raise exception 'The file is not with your department at this stage.';
  end if;

  v_from := v_inst.holder_desk_id;
  update stage_instances set holder_desk_id = p_to_desk where id = v_inst.id;
  insert into file_movements (project_id, stage_instance_id, action, from_desk_id, to_desk_id, actor_id, remark)
  values (p_project, v_inst.id, 'FORWARDED', v_from, p_to_desk, v_actor, p_remark);
end;
$$;

-- R7.1 — called by pg_cron every 10 minutes and by /api/cron/sla.
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

    insert into escalations (project_id, stage_instance_id, breached_at, status)
    values (v_inst.project_id, v_inst.id, v_inst.due_at, 'AWAITING_JUSTIFICATION')
    on conflict (stage_instance_id) do nothing;

    insert into file_movements (project_id, stage_instance_id, action, from_desk_id, remark)
    values (v_inst.project_id, v_inst.id, 'ESCALATED', v_inst.holder_desk_id,
            'SLA breached — escalated to the Ministry. Forward movement frozen.');

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- R7.5 / R7.6 — the decision, the re-entry, HIGH priority and the new SLA.
create or replace function fn_record_decision(
  p_escalation uuid, p_type decision_type, p_changes text, p_reason text,
  p_new_sla int, p_reentry stage_key, p_priority priority_level default 'HIGH'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_esc escalations;
begin
  if my_role() <> 'MINISTRY' then
    raise exception 'Only the Ministry can record an escalation decision.';
  end if;

  select * into v_esc from escalations where id = p_escalation for update;
  if v_esc.status = 'DECIDED' then
    raise exception 'A decision is already on record.';
  end if;

  insert into decisions (escalation_id, decided_by, decision_type, changes_ordered, reason,
                         new_sla_days, reentry_stage_key, priority)
  values (p_escalation, v_actor, p_type, p_changes, p_reason, p_new_sla, p_reentry, p_priority);

  update escalations set status = 'DECIDED' where id = p_escalation;
  update stage_instances set status = 'RETURNED', ended_at = now_app()
   where id = v_esc.stage_instance_id;

  if p_type = 'CANCEL_PROJECT' then
    update projects set status = 'CANCELLED' where id = v_esc.project_id;
    return;
  end if;

  update projects set status = 'ACTIVE', priority = p_priority where id = v_esc.project_id;
  perform fn_open_stage_instance(
    v_esc.project_id, p_reentry, p_new_sla, 'REENTRY', v_actor,
    'Re-entered after the Ministry decision, priority ' || p_priority ||
    ', SLA ' || p_new_sla || ' days. ' || p_changes);
end;
$$;

-- Every 10 minutes (plan Section 2). Requires the pg_cron extension.
-- select cron.schedule('pwfts-sla-sweep', '*/10 * * * *', $$select fn_sla_sweep()$$);
