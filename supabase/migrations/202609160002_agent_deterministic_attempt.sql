alter table public.mipo_agent_steps drop constraint if exists mipo_agent_steps_attempt_number_check;
alter table public.mipo_agent_steps add constraint mipo_agent_steps_attempt_number_check check (attempt_number in (1,2,3));
