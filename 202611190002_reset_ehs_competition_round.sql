-- OPPO EHS Competition Reset — 2026-11-19
-- Run this script ONCE in Supabase SQL Editor to start a clean contest round.
-- IMPORTANT: This deletes participation/progress/session records only.
-- It DOES NOT delete employee accounts, passwords, employee directory rows, or supervisor access.

begin;

-- Clear the previous round's saved scores, discovered hazards and asset checks.
delete from public.ehs_game_progress;

-- Clear previous round's login history and session tracking.
delete from public.ehs_game_sessions;

-- Keep public.ehs_game_employees and auth.users unchanged.
commit;

-- Verification: both counts should be 0; employee directory should remain populated.
select
  (select count(*) from public.ehs_game_sessions) as remaining_sessions,
  (select count(*) from public.ehs_game_progress) as remaining_game_progress,
  (select count(*) from public.ehs_game_employees) as preserved_employee_accounts;
