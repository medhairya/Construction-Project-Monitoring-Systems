-- Rebuilding the demo data has to get past the R8 triggers from 0004.
--
-- The answer is not to weaken them. TRUNCATE does not fire row-level delete
-- triggers, so a reset stays a deliberate, whole-table operation while an
-- ordinary DELETE on a single audit row is still refused. That is the
-- distinction worth keeping: you can rebuild the demo, you cannot quietly
-- edit history.
--
-- This is what the Admin "Reset demo data" button and the seeding script call.

create or replace function fn_reset_data(p_keep_reference boolean default false)
returns void
language plpgsql security definer set search_path = public as $$
begin
  truncate table
    ai_outputs, completion_reports, eot_requests, ra_bills,
    execution_reports, execution_checklist_items,
    decisions, chat_messages, chat_threads, justifications, escalations,
    file_movements, subtasks, project_sla_overrides, stage_instances, projects
  cascade;

  if not p_keep_reference then
    truncate table stage_definitions, profiles, desks, departments, districts cascade;
  end if;

  update system_clock set offset_minutes = 0 where id = 1;
end;
$$;
