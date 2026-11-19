-- OPPO EHS: durable employee game progress across repeat logins.
-- Run once in Supabase SQL Editor. This is additive and preserves existing sessions.

create table if not exists public.ehs_game_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id text not null,
  full_name text not null,
  department text not null,
  found_hazard_ids jsonb not null default '[]'::jsonb,
  checked_asset_ids jsonb not null default '[]'::jsonb,
  score integer not null default 0 check (score >= 0),
  false_alarms integer not null default 0 check (false_alarms >= 0),
  accuracy numeric(5,2) not null default 100 check (accuracy between 0 and 100),
  updated_at timestamptz not null default now()
);

alter table public.ehs_game_progress enable row level security;

drop policy if exists "employee reads own game progress" on public.ehs_game_progress;
create policy "employee reads own game progress" on public.ehs_game_progress
for select to authenticated using (user_id = auth.uid() or public.ehs_game_is_supervisor());

drop policy if exists "employee inserts own game progress" on public.ehs_game_progress;
create policy "employee inserts own game progress" on public.ehs_game_progress
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "employee updates own game progress" on public.ehs_game_progress;
create policy "employee updates own game progress" on public.ehs_game_progress
for update to authenticated using (user_id = auth.uid() or public.ehs_game_is_supervisor())
with check (user_id = auth.uid() or public.ehs_game_is_supervisor());

grant select, insert, update on public.ehs_game_progress to authenticated;
