alter table public.mipo_agent_steps drop constraint if exists mipo_agent_steps_provider_check;
alter table public.mipo_agent_steps add constraint mipo_agent_steps_provider_check check (provider in ('eloagents','groq','python'));
