-- Our Money Dashboard — Supabase setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

-- One row per household. The app's data is stored as one JSON document.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Household',
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
  data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Who belongs to which household.
create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Row Level Security: nobody can read or change a household unless they are a member.
alter table public.households enable row level security;
alter table public.household_members enable row level security;

create or replace function public.is_household_member(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

drop policy if exists "members can read their household" on public.households;
create policy "members can read their household" on public.households
  for select to authenticated using (public.is_household_member(id));

drop policy if exists "members can read memberships" on public.household_members;
create policy "members can read memberships" on public.household_members
  for select to authenticated using (user_id = auth.uid() or public.is_household_member(household_id));

-- No direct insert/update/delete policies: all writes go through the functions below.

-- Create a household with the current user as its first member.
create or replace function public.create_household(p_name text, p_data jsonb)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first';
  end if;
  insert into public.households (name, data, version, updated_by)
  values (coalesce(nullif(trim(p_name), ''), 'Our Household'), coalesce(p_data, '{}'::jsonb), 1, auth.uid())
  returning * into h;
  insert into public.household_members (household_id, user_id) values (h.id, auth.uid());
  return h;
end;
$$;

-- Join an existing household with its invite code.
create or replace function public.join_household(p_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first';
  end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'Invite code not found';
  end if;
  insert into public.household_members (household_id, user_id)
  values (h.id, auth.uid())
  on conflict do nothing;
  return h;
end;
$$;

-- Save the data only if nobody else saved in between (optimistic locking).
-- Returns the new version, or -1 if someone else saved first (the app then merges and retries).
create or replace function public.save_household(p_id uuid, p_data jsonb, p_expected_version bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v bigint;
begin
  if not public.is_household_member(p_id) then
    raise exception 'Not a member of this household';
  end if;
  update public.households
     set data = p_data, version = version + 1, updated_at = now(), updated_by = auth.uid()
   where id = p_id and version = p_expected_version
  returning version into v;
  return coalesce(v, -1);
end;
$$;

-- Only signed-in users may call the functions.
revoke all on function public.create_household(text, jsonb) from public, anon;
revoke all on function public.join_household(text) from public, anon;
revoke all on function public.save_household(uuid, jsonb, bigint) from public, anon;
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.create_household(text, jsonb) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.save_household(uuid, jsonb, bigint) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;

-- Live updates: tell the other person's app when the household changes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'households'
     ) then
    alter publication supabase_realtime add table public.households;
  end if;
end;
$$;
