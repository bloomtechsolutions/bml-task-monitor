-- Progress is no longer typed in by people; it follows from status and the checklist.
--   not started → 0 · in progress / blocked → % of checklist ticked (50 if no checklist)
--   awaiting sign-off / done → 100 · cancelled → unchanged

create or replace function private.auto_progress(p_task uuid, p_status public.task_status, p_current smallint)
returns smallint language sql stable set search_path = '' as $$
  select case
    when p_status = 'not_started' then 0
    when p_status in ('submitted', 'done') then 100
    when p_status = 'cancelled' then p_current
    else coalesce(
      (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where c.is_done) / count(*)) end
         from public.task_checklist_items c where c.task_id = p_task),
      50)
  end::smallint
$$;

-- Runs after tasks_completion (triggers fire in name order) so it has the final say.
create or replace function private.task_auto_progress() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.progress := private.auto_progress(new.id, new.status, new.progress);
  return new;
end $$;

drop trigger if exists tasks_zz_auto_progress on public.tasks;
create trigger tasks_zz_auto_progress before insert or update on public.tasks
  for each row execute function private.task_auto_progress();

-- Ticking, adding or removing checklist steps recalculates the task.
create or replace function private.checklist_progress() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_task uuid := coalesce(new.task_id, old.task_id);
begin
  update public.tasks t set progress = private.auto_progress(t.id, t.status, t.progress)
   where t.id = v_task and t.progress is distinct from private.auto_progress(t.id, t.status, t.progress);
  return null;
end $$;

drop trigger if exists task_checklist_progress on public.task_checklist_items;
create trigger task_checklist_progress after insert or update or delete on public.task_checklist_items
  for each row execute function private.checklist_progress();

-- Progress-only changes are no longer logged as "updates" (they follow from status/checklist,
-- which are logged themselves).
create or replace function private.log_task_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status or new.due_date is distinct from old.due_date then
    insert into public.task_updates (task_id, author_id, note, old_status, new_status, old_progress, new_progress, old_due_date, new_due_date)
    values (new.id, nullif(current_setting('app.actor', true), '')::uuid,
            nullif(current_setting('app.update_note', true), ''),
            old.status, new.status, old.progress, new.progress, old.due_date, new.due_date);
  end if;
  return new;
end $$;

revoke execute on all functions in schema private from public;

-- Bring existing tasks in line without touching their "last updated" time.
alter table public.tasks disable trigger tasks_updated_at;
update public.tasks t set progress = private.auto_progress(t.id, t.status, t.progress)
 where t.progress is distinct from private.auto_progress(t.id, t.status, t.progress);
alter table public.tasks enable trigger tasks_updated_at;
