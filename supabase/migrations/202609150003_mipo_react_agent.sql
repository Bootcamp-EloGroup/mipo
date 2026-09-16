create table public.mipo_agent_runs (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.mipo_interventions(id) on delete cascade,
  context_hash text not null,
  status text not null check (status in ('pending','eloagents_succeeded','groq_succeeded','deterministic_fallback','rejected_by_policy')),
  provider text check (provider in ('eloagents','groq','deterministic')),
  model text,
  action text check (action in ('explain_evidence','present_authorized_alternative','suggest_add_to_cart','no_intervention')),
  message text,
  rationale_code text,
  prompt_version text not null,
  policy_version text not null,
  latency_ms integer check (latency_ms >= 0),
  rejection_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index mipo_agent_runs_context_cache on public.mipo_agent_runs(context_hash, completed_at desc) where status in ('eloagents_succeeded','groq_succeeded');
create index mipo_agent_runs_intervention on public.mipo_agent_runs(intervention_id, created_at desc);

create table public.mipo_agent_steps (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.mipo_agent_runs(id) on delete cascade,
  step_number integer not null check (step_number between 1 and 4),
  provider text not null check (provider in ('eloagents','groq')),
  kind text not null check (kind in ('tool_call','final_answer')),
  tool_name text check (tool_name in ('get_product_evidence','calculate_mipo_risk','get_allowed_actions')),
  status text not null check (status in ('succeeded','rejected')),
  duration_ms integer not null check (duration_ms >= 0),
  observation_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id, step_number)
);

alter table public.mipo_agent_runs enable row level security;
alter table public.mipo_agent_steps enable row level security;
revoke all on public.mipo_agent_runs, public.mipo_agent_steps from anon, authenticated;

create or replace function public.reset_demo_data(apply_reset boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'sessions',(select count(*) from public.anonymous_sessions where is_demo is true),
    'carts',(select count(*) from public.carts c join public.anonymous_sessions s on s.id=c.session_id where s.is_demo is true),
    'interventions',(select count(*) from public.mipo_interventions i join public.anonymous_sessions s on s.id=i.session_id where s.is_demo is true),
    'decisions',(select count(*) from public.mipo_decisions d join public.anonymous_sessions s on s.id=d.session_id where s.is_demo is true),
    'agent_runs',(select count(*) from public.mipo_agent_runs a join public.mipo_interventions i on i.id=a.intervention_id join public.anonymous_sessions s on s.id=i.session_id where s.is_demo is true)
  ) into result;
  if apply_reset then
    delete from public.mipo_decisions d using public.anonymous_sessions s where d.session_id=s.id and s.is_demo is true;
    delete from public.mipo_interventions i using public.anonymous_sessions s where i.session_id=s.id and s.is_demo is true;
    delete from public.carts c using public.anonymous_sessions s where c.session_id=s.id and s.is_demo is true;
    delete from public.anonymous_sessions where is_demo is true;
  end if;
  return result;
end;
$$;
revoke execute on function public.reset_demo_data(boolean) from public,anon,authenticated;
grant execute on function public.reset_demo_data(boolean) to service_role;
