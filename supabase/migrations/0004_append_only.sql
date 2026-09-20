-- R8 — append-only, enforced for every caller.
--
-- Withholding the RLS update/delete policies is not enough: the app connects
-- with the secret key (service_role), which bypasses RLS, so a bug or a
-- misuse of that key could still rewrite the record. A trigger fires whatever
-- the role, so the audit trail cannot be edited by anything short of someone
-- with rights to drop the trigger itself.
--
-- Covers the three tables the plan names as permanent: file movements, the
-- official chat, and Ministry decisions.

create or replace function fn_block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only (rule R8): rows cannot be % once written.',
    tg_table_name, lower(tg_op) || 'd';
end;
$$;

create trigger chat_messages_append_only
  before update or delete on chat_messages
  for each row execute function fn_block_mutation();

create trigger decisions_append_only
  before update or delete on decisions
  for each row execute function fn_block_mutation();

create trigger file_movements_append_only
  before update or delete on file_movements
  for each row execute function fn_block_mutation();

-- Justifications are part of the same record: once submitted to the Ministry
-- they stand, and a correction is made by submitting another one.
create trigger justifications_append_only
  before update or delete on justifications
  for each row execute function fn_block_mutation();
