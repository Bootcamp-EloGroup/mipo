create table public.wismo_service_events (
  id uuid primary key,
  session_id uuid not null,
  order_code text not null check (order_code ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  request_human boolean not null default false,
  status text not null check (status in ('on_time','delayed','no_update','delivered','inconclusive')),
  outcome text not null check (outcome in ('resolved','escalated','not_found')),
  escalation_reason text check (char_length(escalation_reason) <= 500),
  data_origin text not null check (data_origin in ('observed','synthetic','mock')),
  resolution text check (resolution in ('solved','pending')),
  rating smallint check (rating between 1 and 5),
  occurred_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wismo_service_events_occurred_at on public.wismo_service_events(occurred_at desc);
create index wismo_service_events_session on public.wismo_service_events(session_id, occurred_at desc);
create index wismo_service_events_outcome on public.wismo_service_events(outcome, status);

alter table public.wismo_service_events enable row level security;
revoke all on public.wismo_service_events from anon, authenticated;

comment on table public.wismo_service_events is
  'Atendimentos WISMO calculados no servidor; acesso exclusivo pela service role.';
