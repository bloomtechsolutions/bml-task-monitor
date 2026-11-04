-- Phase 2: sign-in, approvals, checklists, templates, evidence, leave, notifications,
-- recurring tasks, reminders/escalation and weekly digest.
--
-- Trust model: the database is only reached by the app server (the key is server-side).
-- The app server authenticates people (staff no + password) and enforces roles.
-- Password hashes live in the `private` schema, which the API cannot read.

-- ---------- Sign-in ----------
alter table public.profiles add column if not exists session_version int not null default 1;

create table if not exists private.credentials (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  password_hash  text not null,
  must_change    boolean not null default true,
  updated_at     timestamptz not null default now()
);

create table if not exists private.login_attempts (
  staff_no      text primary key,
  failures      int not null default 0,
  locked_until  timestamptz
);

create or replace function public.auth_login(p_staff_no text, p_password text)
returns table (profile_id uuid, session_version int, must_change boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := lower(trim(coalesce(p_staff_no, '')));
  v_locked timestamptz;
  v_id uuid; v_ver int; v_hash text; v_must boolean;
begin
  select a.locked_until into v_locked from private.login_attempts a where a.staff_no = v_key;
  if v_locked is not null and v_locked > now() then
    raise exception 'locked_until:%', to_char(v_locked at time zone 'Indian/Maldives', 'HH24:MI');
  end if;

  select p.id, p.session_version, c.password_hash, c.must_change
    into v_id, v_ver, v_hash, v_must
    from public.profiles p
    join private.credentials c on c.profile_id = p.id
   where lower(p.staff_no) = v_key and p.is_active;

  if v_hash is not null and v_hash = extensions.crypt(coalesce(p_password, ''), v_hash) then
    delete from private.login_attempts where staff_no = v_key;
    return query select v_id, v_ver, v_must;
    return;
  end if;

  -- Failed: 5 strikes locks the staff number for 15 minutes.
  insert into private.login_attempts as a (staff_no, failures) values (v_key, 1)
  on conflict (staff_no) do update
    set failures = case when a.failures + 1 >= 5 then 0 else a.failures + 1 end,
        locked_until = case when a.failures + 1 >= 5 then now() + interval '15 minutes' else a.locked_until end;
end $$;

create or replace function public.auth_set_password(p_profile_id uuid, p_password text, p_temporary boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare v_ver int;
begin
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'Password must be at least 8 characters.';
  end if;
  insert into private.credentials as c (profile_id, password_hash, must_change)
  values (p_profile_id, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_temporary)
  on conflict (profile_id) do update
    set password_hash = excluded.password_hash, must_change = excluded.must_change, updated_at = now();
  -- Invalidate existing sessions.
  update public.profiles set session_version = session_version + 1 where id = p_profile_id
  returning session_version into v_ver;
  delete from private.login_attempts
   where staff_no = (select lower(staff_no) from public.profiles where id = p_profile_id);
  return v_ver;
end $$;

create or replace function public.auth_check_password(p_profile_id uuid, p_password text)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from private.credentials c
     where c.profile_id = p_profile_id and c.password_hash = extensions.crypt(coalesce(p_password, ''), c.password_hash)
  );
$$;

create or replace function public.auth_status()
returns table (profile_id uuid, has_password boolean, must_change boolean, locked boolean)
language sql security definer set search_path = '' stable as $$
  select p.id, c.profile_id is not null, coalesce(c.must_change, false),
         coalesce(a.locked_until > now(), false)
    from public.profiles p
    left join private.credentials c on c.profile_id = p.id
    left join private.login_attempts a on a.staff_no = lower(p.staff_no);
$$;

revoke all on function public.auth_login(text, text), public.auth_set_password(uuid, text, boolean),
  public.auth_check_password(uuid, text), public.auth_status() from public;
grant execute on function public.auth_login(text, text), public.auth_set_password(uuid, text, boolean),
  public.auth_check_password(uuid, text), public.auth_status() to anon, authenticated;

-- ---------- Approvals ----------
alter table public.tasks
  add column if not exists requires_approval boolean not null default false,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null;
create index if not exists tasks_approved_by_idx on public.tasks (approved_by);

create or replace function private.task_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'submitted' and old.status <> 'submitted' then
    new.submitted_at = now(); new.progress = 100;
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.completed_at = now(); new.progress = 100;
    new.submitted_at = coalesce(new.submitted_at, now());
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at = null;
  end if;
  if new.status not in ('submitted', 'done') and old.status in ('submitted', 'done') then
    new.submitted_at = null; new.approved_by = null;
  end if;
  return new;
end $$;

-- ---------- Checklists ----------
create table if not exists public.task_checklist_items (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 300),
  is_done     boolean not null default false,
  position    int not null default 0,
  done_by     uuid references public.profiles(id) on delete set null,
  done_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists task_checklist_items_task_idx on public.task_checklist_items (task_id, position);
create index if not exists task_checklist_items_done_by_idx on public.task_checklist_items (done_by);

-- ---------- Templates ----------
create table if not exists public.task_templates (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(name) between 2 and 120),
  title              text not null check (char_length(title) between 3 and 200),
  description        text,
  unit_id            uuid references public.units(id) on delete cascade,
  priority           public.task_priority not null default 'medium',
  due_in_days        smallint not null default 7 check (due_in_days between 0 and 365),
  requires_approval  boolean not null default true,
  checklist          jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists task_templates_unit_idx on public.task_templates (unit_id);
create index if not exists task_templates_created_by_idx on public.task_templates (created_by);
drop trigger if exists task_templates_updated_at on public.task_templates;
create trigger task_templates_updated_at before update on public.task_templates
  for each row execute function private.set_updated_at();

alter table public.recurrence_rules
  add column if not exists template_id uuid references public.task_templates(id) on delete set null,
  add column if not exists requires_approval boolean not null default false;
create index if not exists recurrence_rules_template_idx on public.recurrence_rules (template_id);
create unique index if not exists tasks_recurrence_due_uniq on public.tasks (recurrence_rule_id, due_date)
  where recurrence_rule_id is not null;

-- ---------- Evidence ----------
alter table public.task_attachments add column if not exists content_type text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-evidence', 'task-evidence', false, 4194304, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'text/csv', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tm_evidence_access on storage.objects;
create policy tm_evidence_access on storage.objects for all to anon
  using (bucket_id = 'task-evidence') with check (bucket_id = 'task-evidence');

-- ---------- Leave ----------
do $$ begin
  create type public.leave_kind as enum ('annual', 'sick', 'training', 'official', 'other');
exception when duplicate_object then null; end $$;

create table if not exists public.leave (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  kind        public.leave_kind not null default 'annual',
  note        text check (char_length(note) <= 200),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint leave_dates check (end_date >= start_date)
);
create index if not exists leave_profile_idx on public.leave (profile_id, start_date);
create index if not exists leave_created_by_idx on public.leave (created_by);

-- ---------- Notifications ----------
alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete set null,
  add column if not exists body text,
  add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_uniq on public.notifications (dedupe_key);
create index if not exists notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index if not exists notifications_actor_idx on public.notifications (actor_id);

create or replace function private.notify(p_recipient uuid, p_task uuid, p_kind text, p_actor uuid,
                                          p_body text default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null or p_recipient is not distinct from p_actor then return; end if;
  insert into public.notifications (recipient_id, task_id, kind, channel, actor_id, body, dedupe_key)
  values (p_recipient, p_task, p_kind, 'in_app', p_actor, p_body, p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function private.task_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := nullif(current_setting('app.actor', true), '')::uuid;
  v_follow uuid;
begin
  if tg_op = 'INSERT' then
    perform private.notify(new.assignee_id, new.id, 'assigned', coalesce(new.assigned_by, v_actor));
    return new;
  end if;

  v_follow := coalesce(new.assigned_by,
                       (select u.manager_id from public.units u where u.id = new.unit_id));

  if new.assignee_id is distinct from old.assignee_id then
    perform private.notify(new.assignee_id, new.id, 'assigned', v_actor);
  end if;
  if new.status is distinct from old.status then
    if new.status = 'submitted' then
      perform private.notify(v_follow, new.id, 'submitted', v_actor);
    elsif new.status = 'done' and old.status = 'submitted' then
      perform private.notify(new.assignee_id, new.id, 'approved', v_actor);
    elsif new.status = 'done' then
      perform private.notify(v_follow, new.id, 'completed', v_actor);
    elsif old.status = 'submitted' and new.status in ('in_progress', 'not_started') then
      perform private.notify(new.assignee_id, new.id, 'returned', v_actor, nullif(current_setting('app.update_note', true), ''));
    elsif new.status = 'blocked' then
      perform private.notify(v_follow, new.id, 'blocked', v_actor, nullif(current_setting('app.update_note', true), ''));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tasks_events on public.tasks;
create trigger tasks_events after insert or update on public.tasks
  for each row execute function private.task_events();

create or replace function private.comment_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  select assignee_id, assigned_by into t from public.tasks where id = new.task_id;
  perform private.notify(t.assignee_id, new.task_id, 'comment', new.author_id, left(new.body, 140));
  if t.assigned_by is distinct from t.assignee_id then
    perform private.notify(t.assigned_by, new.task_id, 'comment', new.author_id, left(new.body, 140));
  end if;
  return new;
end $$;

drop trigger if exists task_comments_events on public.task_comments;
create trigger task_comments_events after insert on public.task_comments
  for each row execute function private.comment_events();

-- ---------- Settings defaults ----------
insert into public.app_settings (key, value) values
  ('escalation_days', '2'::jsonb),
  ('overload_threshold', '8'::jsonb),
  ('digest_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- ---------- Recurring tasks ----------
create or replace function private.today_mv() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Indian/Maldives')::date $$;

create or replace function private.next_occurrence(p_freq public.recurrence_frequency, p_dom smallint, p_from date)
returns date language plpgsql immutable set search_path = '' as $$
declare d date; m date;
begin
  if p_freq = 'daily' then
    d := p_from + 1;
    while extract(dow from d) in (5, 6) loop d := d + 1; end loop;  -- Maldives weekend: Fri, Sat
    return d;
  elsif p_freq = 'weekly' then
    return p_from + 7;
  end if;
  m := date_trunc('month', p_from)::date + (case when p_freq = 'monthly' then interval '1 month' else interval '3 months' end);
  return least(m + (coalesce(p_dom, extract(day from p_from)::smallint) - 1),
               (m + interval '1 month' - interval '1 day')::date);
end $$;

create or replace function public.generate_recurring_tasks()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record; v_task uuid; v_count int := 0; v_guard int; v_today date := private.today_mv();
begin
  for r in select * from public.recurrence_rules where is_active for update loop
    v_guard := 0;
    while r.next_due_date - r.lead_days <= v_today and v_guard < 31 loop
      v_guard := v_guard + 1;
      insert into public.tasks (title, description, unit_id, assignee_id, assigned_by, due_date, priority,
                                recurrence_rule_id, requires_approval)
      values (r.title, r.description, r.unit_id, r.assignee_id, r.created_by, r.next_due_date, r.priority,
              r.id, r.requires_approval)
      on conflict (recurrence_rule_id, due_date) where recurrence_rule_id is not null do nothing
      returning id into v_task;

      if v_task is not null then
        v_count := v_count + 1;
        if r.template_id is not null then
          insert into public.task_checklist_items (task_id, body, position)
          select v_task, left(item.value #>> '{}', 300), item.ordinality::int
            from public.task_templates t, jsonb_array_elements(t.checklist) with ordinality as item
           where t.id = r.template_id and coalesce(item.value #>> '{}', '') <> '';
        end if;
      end if;
      v_task := null;
      r.next_due_date := private.next_occurrence(r.frequency, r.day_of_month, r.next_due_date);
    end loop;
    update public.recurrence_rules set next_due_date = r.next_due_date where id = r.id and next_due_date <> r.next_due_date;
  end loop;
  return v_count;
end $$;
grant execute on function public.generate_recurring_tasks() to anon, authenticated;

-- ---------- Reminders & escalation (daily) ----------
create or replace function public.run_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  t record; v_today date := private.today_mv(); v_n int := 0;
  v_esc int := coalesce((select (value #>> '{}')::int from public.app_settings where key = 'escalation_days'), 2);
  v_unit_mgr uuid; v_mgr uuid; v_head record;
begin
  for t in
    select k.*, v_today - k.due_date as late
      from public.tasks k
     where k.status in ('not_started', 'in_progress', 'blocked')
       and k.due_date <= v_today + 1
  loop
    if t.due_date = v_today + 1 then
      perform private.notify(t.assignee_id, t.id, 'due_soon', null, null, format('due_soon:%s:%s', t.id, t.due_date));
    elsif t.due_date = v_today then
      perform private.notify(t.assignee_id, t.id, 'due_today', null, null, format('due_today:%s:%s', t.id, t.due_date));
    else
      perform private.notify(t.assignee_id, t.id, 'overdue', null, null, format('overdue:%s:%s', t.id, t.due_date));
      perform private.notify(t.assigned_by, t.id, 'overdue_assigned', t.assignee_id, null, format('overdue_by:%s:%s', t.id, t.due_date));
      if t.late >= v_esc then
        select manager_id into v_unit_mgr from public.units where id = t.unit_id;
        for v_mgr in
          select id from public.profiles
           where is_active and role = 'manager' and unit_id = t.unit_id
          union select v_unit_mgr where v_unit_mgr is not null
        loop
          perform private.notify(v_mgr, t.id, 'escalated', t.assignee_id, format('%s days overdue', t.late),
                                 format('esc1:%s:%s:%s', t.id, t.due_date, v_mgr));
        end loop;
      end if;
      if t.late >= v_esc * 2 then
        for v_head in select id from public.profiles where is_active and role = 'head' loop
          perform private.notify(v_head.id, t.id, 'escalated', t.assignee_id, format('%s days overdue', t.late),
                                 format('esc2:%s:%s:%s', t.id, t.due_date, v_head.id));
        end loop;
      end if;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.run_reminders() to anon, authenticated;

-- ---------- Weekly digest ----------
create or replace function public.digest_rows()
returns table (profile_id uuid, full_name text, email text, open_count int, overdue_count int,
               due_week_count int, awaiting_count int)
language sql security definer set search_path = '' stable as $$
  with today as (select private.today_mv() as d)
  select p.id, p.full_name, p.email,
    (select count(*) from public.tasks t where t.assignee_id = p.id and t.status in ('not_started','in_progress','blocked'))::int,
    (select count(*) from public.tasks t, today where t.assignee_id = p.id and t.status in ('not_started','in_progress','blocked') and t.due_date < today.d)::int,
    (select count(*) from public.tasks t, today where t.assignee_id = p.id and t.status in ('not_started','in_progress','blocked') and t.due_date between today.d and today.d + 6)::int,
    (select count(*) from public.tasks t where t.assigned_by = p.id and t.status = 'submitted')::int
  from public.profiles p where p.is_active;
$$;
grant execute on function public.digest_rows() to anon, authenticated;

create or replace function public.weekly_digest_notify()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0; v_week text := to_char(private.today_mv(), 'IYYY-IW');
begin
  if coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'digest_enabled'), true) is not true then
    return 0;
  end if;
  for r in select * from public.digest_rows() loop
    if r.open_count + r.awaiting_count = 0 then continue; end if;
    perform private.notify(r.profile_id, null, 'digest', null,
      format('%s open · %s overdue · %s due this week · %s waiting for your approval',
             r.open_count, r.overdue_count, r.due_week_count, r.awaiting_count),
      format('digest:%s:%s', r.profile_id, v_week));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
grant execute on function public.weekly_digest_notify() to anon, authenticated;

-- ---------- Read model ----------
drop view if exists public.task_overview;
create view public.task_overview with (security_invoker = true) as
select
  t.id, t.title, t.description, t.status, t.priority, t.progress,
  t.start_date, t.due_date, t.completed_at, t.submitted_at, t.created_at, t.updated_at,
  t.requires_approval, t.approved_by,
  t.unit_id, u.name as unit_name, u.code as unit_code,
  t.assignee_id, a.full_name as assignee_name,
  t.assigned_by, b.full_name as assigned_by_name,
  t.project_id, p.title as project_title,
  t.parent_task_id, t.recurrence_rule_id,
  (t.status in ('not_started', 'in_progress', 'blocked')
     and t.due_date < (now() at time zone 'Indian/Maldives')::date) as is_overdue,
  case when t.status in ('not_started', 'in_progress', 'blocked') and t.due_date < (now() at time zone 'Indian/Maldives')::date
       then (now() at time zone 'Indian/Maldives')::date - t.due_date else 0 end as days_overdue,
  (select count(*) from public.tasks s where s.parent_task_id = t.id and s.status <> 'cancelled')::int as subtask_count,
  (select count(*) from public.task_checklist_items c where c.task_id = t.id)::int as checklist_total,
  (select count(*) from public.task_checklist_items c where c.task_id = t.id and c.is_done)::int as checklist_done,
  (select count(*) from public.task_attachments f where f.task_id = t.id)::int as attachment_count
from public.tasks t
join public.units u on u.id = t.unit_id
join public.profiles a on a.id = t.assignee_id
left join public.profiles b on b.id = t.assigned_by
left join public.projects p on p.id = t.project_id;

grant select on public.task_overview to anon, authenticated;

-- Nothing in `private` is callable by API roles.
revoke execute on all functions in schema private from public;

-- ---------- Access for new tables (same trust model as the rest) ----------
do $$
declare t text;
begin
  foreach t in array array['task_checklist_items', 'task_templates', 'leave'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists open_access on public.%I', t);
    execute format('create policy open_access on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon', t);
  end loop;
end $$;

-- ---------- Schedules (times are UTC; Maldives = UTC+5) ----------
create extension if not exists pg_cron;
do $$
declare j text;
begin
  foreach j in array array['tm-recurring', 'tm-reminders', 'tm-digest'] loop
    perform cron.unschedule(j) where exists (select 1 from cron.job where jobname = j);
  end loop;
end $$;
select cron.schedule('tm-recurring', '5 19 * * *', 'select public.generate_recurring_tasks()');  -- 00:05 MVT
select cron.schedule('tm-reminders', '0 3 * * *', 'select public.run_reminders()');             -- 08:00 MVT
select cron.schedule('tm-digest', '30 2 * * 0', 'select public.weekly_digest_notify()');         -- Sun 07:30 MVT
