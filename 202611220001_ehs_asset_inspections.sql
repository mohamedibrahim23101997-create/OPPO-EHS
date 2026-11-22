-- OPPO EHS: additive asset inspection records for interactive equipment checks.
-- Run once in Supabase SQL Editor before using the inspection save/report features.
-- Existing employee accounts, sessions, scores and competition progress are not deleted or reset.

create table if not exists public.ehs_asset_inspections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id text not null,
  full_name text not null,
  department text not null,
  session_id uuid null references public.ehs_game_sessions(id) on delete set null,
  asset_code text not null,
  asset_name text not null,
  zone text not null,
  inspection_status text not null check (inspection_status in ('compliant','requires_follow_up')),
  checks jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists ehs_asset_inspections_created_at_idx
  on public.ehs_asset_inspections(created_at desc);
create index if not exists ehs_asset_inspections_employee_idx
  on public.ehs_asset_inspections(employee_id, created_at desc);
create index if not exists ehs_asset_inspections_asset_idx
  on public.ehs_asset_inspections(asset_code, created_at desc);

alter table public.ehs_asset_inspections enable row level security;

drop policy if exists "employee reads own asset inspections" on public.ehs_asset_inspections;
create policy "employee reads own asset inspections" on public.ehs_asset_inspections
for select to authenticated
using (user_id = auth.uid() or public.ehs_game_is_supervisor());

drop policy if exists "employee inserts own asset inspections" on public.ehs_asset_inspections;
create policy "employee inserts own asset inspections" on public.ehs_asset_inspections
for insert to authenticated
with check (user_id = auth.uid());

grant select, insert on public.ehs_asset_inspections to authenticated;
