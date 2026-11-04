-- NOT YET APPLIED (confirmation prompt timed out). Apply before inviting staff.
-- Anyone can request a magic link, so an account alone must not reveal the staff directory.
-- A "member" is an active profile that the Head has placed in a unit (or the Head).
create or replace function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_active and (role = 'head' or unit_id is not null)
                   from public.profiles where id = (select auth.uid())), false)
$$;
grant execute on function private.is_member() to authenticated;

drop policy profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_member()));

drop policy units_read on public.units;
create policy units_read on public.units for select to authenticated
  using ((select private.is_member()));

drop policy settings_read on public.app_settings;
create policy settings_read on public.app_settings for select to authenticated
  using ((select private.is_member()));
