-- Owner decision (2026-11-04): no login. Anyone with the link can read and edit.
-- People are managed in-app (People page) instead of coming from auth sign-ups.
-- Run once in Supabase → SQL Editor if it hasn't been applied.

-- 1) Profiles no longer depend on auth.users
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles alter column email drop not null;
drop trigger if exists on_auth_user_created on auth.users;

-- 2) Author columns: the app passes the person chosen under "I am…"
alter table public.task_comments alter column author_id drop not null;
alter table public.task_comments alter column author_id drop default;
alter table public.task_attachments alter column uploaded_by drop not null;
alter table public.task_attachments alter column uploaded_by drop default;
alter table public.task_updates alter column author_id drop default;
alter table public.tasks alter column assigned_by drop default;
alter table public.projects alter column created_by drop default;
alter table public.recurrence_rules alter column created_by drop default;

-- 3) Role guards relied on signed-in identity; keep only completion bookkeeping
drop trigger if exists profiles_guard on public.profiles;
drop trigger if exists tasks_guard on public.tasks;

create or replace function private.task_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at = now(); new.progress = 100;
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at = null;
  end if;
  return new;
end $$;
drop trigger if exists tasks_completion on public.tasks;
create trigger tasks_completion before update on public.tasks for each row execute function private.task_completion();

-- 4) Audit trail records the chosen person (app.actor)
create or replace function private.log_task_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status or new.progress is distinct from old.progress
     or new.due_date is distinct from old.due_date then
    insert into public.task_updates (task_id, author_id, note, old_status, new_status, old_progress, new_progress, old_due_date, new_due_date)
    values (new.id, nullif(current_setting('app.actor', true), '')::uuid,
            nullif(current_setting('app.update_note', true), ''),
            old.status, new.status, old.progress, new.progress, old.due_date, new.due_date);
  end if;
  return new;
end $$;

drop function if exists public.post_task_update(uuid, text, public.task_status, int);
create or replace function public.post_task_update(p_task_id uuid, p_note text, p_actor uuid default null,
                                                   p_status public.task_status default null, p_progress int default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_count int;
begin
  perform set_config('app.update_note', coalesce(p_note, ''), true);
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  update public.tasks set status = coalesce(p_status, status), progress = coalesce(p_progress, progress)
   where id = p_task_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Task not found'; end if;
  if p_status is null and p_progress is null and coalesce(p_note,'') <> '' then
    insert into public.task_updates (task_id, author_id, note) values (p_task_id, p_actor, p_note);
  end if;
end $$;
grant execute on function public.post_task_update(uuid, text, uuid, public.task_status, int) to anon, authenticated;

create or replace function public.update_task_as(p_task_id uuid, p_actor uuid, p_patch jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_count int;
begin
  perform set_config('app.actor', coalesce(p_actor::text, ''), true);
  perform set_config('app.update_note', '', true);
  update public.tasks set
    due_date    = coalesce((p_patch->>'due_date')::date, due_date),
    priority    = coalesce((p_patch->>'priority')::public.task_priority, priority),
    assignee_id = coalesce((p_patch->>'assignee_id')::uuid, assignee_id),
    unit_id     = coalesce((p_patch->>'unit_id')::uuid, unit_id),
    status      = coalesce((p_patch->>'status')::public.task_status, status)
  where id = p_task_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'Task not found'; end if;
end $$;
grant execute on function public.update_task_as(uuid, uuid, jsonb) to anon, authenticated;

-- 5) Replace every role-based policy with open access
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['units','profiles','projects','recurrence_rules','tasks','task_updates',
                           'task_comments','task_attachments','notifications','app_settings'] loop
    execute format('create policy open_access on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon', t);
  end loop;
end $$;
grant select on public.task_overview to anon;

-- 6) Seed the Head of Retail Banking (skipped if already present)
insert into public.profiles (full_name, staff_no, designation, role)
select 'Mohamed Shaig Ahmed', '1892', 'Head of Retail Banking', 'head'
where not exists (select 1 from public.profiles where staff_no = '1892');
