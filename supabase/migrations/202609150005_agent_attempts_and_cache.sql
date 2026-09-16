alter table public.mipo_agent_runs drop constraint if exists mipo_agent_runs_status_check;
alter table public.mipo_agent_runs add constraint mipo_agent_runs_status_check check (status in ('pending','eloagents_succeeded','groq_succeeded','deterministic_fallback','rejected_by_policy','cache_hit'));
alter table public.mipo_agent_runs drop constraint if exists mipo_agent_runs_provider_check;
alter table public.mipo_agent_runs add constraint mipo_agent_runs_provider_check check (provider in ('eloagents','groq','deterministic','cache'));

alter table public.mipo_agent_steps add column if not exists attempt_number integer;
update public.mipo_agent_steps set attempt_number=1 where attempt_number is null;
alter table public.mipo_agent_steps alter column attempt_number set not null;
alter table public.mipo_agent_steps drop constraint if exists mipo_agent_steps_attempt_number_check;
alter table public.mipo_agent_steps add constraint mipo_agent_steps_attempt_number_check check (attempt_number in (1,2));
alter table public.mipo_agent_steps drop constraint if exists mipo_agent_steps_status_check;
alter table public.mipo_agent_steps add constraint mipo_agent_steps_status_check check (status in ('succeeded','rejected','failed'));
alter table public.mipo_agent_steps drop constraint if exists mipo_agent_steps_run_id_step_number_key;
create unique index if not exists mipo_agent_steps_run_step_attempt_unique on public.mipo_agent_steps(run_id,step_number,attempt_number);
