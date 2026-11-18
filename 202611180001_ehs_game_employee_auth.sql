-- OPPO EHS Game: employee directory and cross-device session tracking.
-- Run once in Supabase SQL Editor. Does not delete or modify existing auth users/tables.

create table if not exists public.ehs_game_employees (
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id text not null unique,
  full_name text not null,
  department text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ehs_game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id text not null,
  full_name text not null,
  department text not null,
  login_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logout_at timestamptz,
  status text not null default 'online' check (status in ('online','offline')),
  current_zone text not null default 'نظرة عامة',
  hazards_found integer not null default 0 check (hazards_found >= 0),
  score integer not null default 0 check (score >= 0),
  accuracy numeric(5,2) not null default 100 check (accuracy between 0 and 100)
);

create index if not exists ehs_game_sessions_login_at_idx on public.ehs_game_sessions(login_at desc);
create index if not exists ehs_game_sessions_employee_idx on public.ehs_game_sessions(employee_id);
create index if not exists ehs_game_sessions_online_idx on public.ehs_game_sessions(status,last_seen_at desc);

create or replace function public.ehs_game_is_supervisor()
returns boolean language sql stable security definer set search_path = public
as $$ select lower(coalesce(auth.jwt()->>'email','')) = 'mo.i.kafrana@gmail.com' $$;

alter table public.ehs_game_employees enable row level security;
alter table public.ehs_game_sessions enable row level security;

 drop policy if exists "employee reads own game profile" on public.ehs_game_employees;
create policy "employee reads own game profile" on public.ehs_game_employees
for select to authenticated using (user_id = auth.uid() or public.ehs_game_is_supervisor());

 drop policy if exists "supervisor manages game employees" on public.ehs_game_employees;
create policy "supervisor manages game employees" on public.ehs_game_employees
for all to authenticated using (public.ehs_game_is_supervisor()) with check (public.ehs_game_is_supervisor());

 drop policy if exists "employee inserts own game session" on public.ehs_game_sessions;
create policy "employee inserts own game session" on public.ehs_game_sessions
for insert to authenticated with check (user_id = auth.uid());

 drop policy if exists "employee updates own game session" on public.ehs_game_sessions;
create policy "employee updates own game session" on public.ehs_game_sessions
for update to authenticated using (user_id = auth.uid() or public.ehs_game_is_supervisor())
with check (user_id = auth.uid() or public.ehs_game_is_supervisor());

 drop policy if exists "employee and supervisor read game sessions" on public.ehs_game_sessions;
create policy "employee and supervisor read game sessions" on public.ehs_game_sessions
for select to authenticated using (user_id = auth.uid() or public.ehs_game_is_supervisor());

grant select on public.ehs_game_employees to authenticated;
grant select, insert, update on public.ehs_game_sessions to authenticated;
