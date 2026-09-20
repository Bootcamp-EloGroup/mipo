create table public.brazilian_states (
  uf text primary key check (char_length(uf) = 2),
  name text not null,
  region text not null check (region in ('norte','nordeste','centro_oeste','sudeste','sul'))
);

insert into public.brazilian_states(uf, name, region) values
  ('AC','Acre','norte'),
  ('AL','Alagoas','nordeste'),
  ('AM','Amazonas','norte'),
  ('AP','Amapá','norte'),
  ('BA','Bahia','nordeste'),
  ('CE','Ceará','nordeste'),
  ('DF','Distrito Federal','centro_oeste'),
  ('ES','Espírito Santo','sudeste'),
  ('GO','Goiás','centro_oeste'),
  ('MA','Maranhão','nordeste'),
  ('MG','Minas Gerais','sudeste'),
  ('MS','Mato Grosso do Sul','centro_oeste'),
  ('MT','Mato Grosso','centro_oeste'),
  ('PA','Pará','norte'),
  ('PB','Paraíba','nordeste'),
  ('PE','Pernambuco','nordeste'),
  ('PI','Piauí','nordeste'),
  ('PR','Paraná','sul'),
  ('RJ','Rio de Janeiro','sudeste'),
  ('RN','Rio Grande do Norte','nordeste'),
  ('RO','Rondônia','norte'),
  ('RR','Roraima','norte'),
  ('RS','Rio Grande do Sul','sul'),
  ('SC','Santa Catarina','sul'),
  ('SE','Sergipe','nordeste'),
  ('SP','São Paulo','sudeste'),
  ('TO','Tocantins','norte');

create table public.logistics_sla (
  id uuid primary key,
  scope text not null check (scope in ('channel','state','region','national')),
  scope_key text not null,
  p50_days integer not null check (p50_days > 0),
  p75_days integer not null check (p75_days > 0),
  p90_days integer not null check (p90_days > 0),
  sample_size integer not null check (sample_size > 0),
  import_run_id uuid not null references public.data_import_runs(id),
  created_at timestamptz not null default now(),
  check (p50_days <= p75_days and p75_days <= p90_days),
  check ((scope = 'national') = (scope_key = 'BR')),
  check (scope <> 'region' or scope_key in ('norte','nordeste','centro_oeste','sudeste','sul'))
);

create unique index logistics_sla_scope_per_import on public.logistics_sla(scope, scope_key, import_run_id);
create index logistics_sla_run on public.logistics_sla(import_run_id, scope);

create table public.wismo_rule_sets (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  preparation_days integer not null check (preparation_days > 0),
  critical_extra_days integer not null check (critical_extra_days > 0),
  high_confidence_sample integer not null check (high_confidence_sample > 0),
  medium_confidence_sample integer not null check (medium_confidence_sample > 0),
  escalation_grace_days integer not null default 0 check (escalation_grace_days >= 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index one_active_wismo_rule_set on public.wismo_rule_sets (is_active) where is_active;

insert into public.wismo_rule_sets(version, preparation_days, critical_extra_days, high_confidence_sample, medium_confidence_sample, escalation_grace_days, is_active)
values ('2026-09-20.v1', 2, 2, 30, 5, 0, true);

alter table public.orders add column customer_key text;
alter table public.orders add column customer_state text references public.brazilian_states(uf);
alter table public.orders add column actual_delivery_days integer check (actual_delivery_days > 0);

create index orders_customer_state_run on public.orders(customer_state, import_run_id);

create table public.order_delivery_assessments (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  sla_id uuid not null references public.logistics_sla(id),
  rule_set_id uuid not null references public.wismo_rule_sets(id),
  import_run_id uuid not null references public.data_import_runs(id),
  applied_scope text not null check (applied_scope in ('channel','state','region','national')),
  sample_size integer not null check (sample_size > 0),
  promised_days integer not null check (promised_days > 0),
  critical_days integer not null check (critical_days > 0),
  actual_delivery_days integer not null check (actual_delivery_days > 0),
  delivery_phase text not null check (delivery_phase in ('preparing','in_transit','delivered')),
  delivery_flag text not null check (delivery_flag in ('on_time','late')),
  days_late integer not null check (days_late >= 0),
  is_critical_breach boolean not null,
  evidence jsonb not null,
  created_at timestamptz not null default now()
);

create unique index order_delivery_assessments_per_rule on public.order_delivery_assessments(order_id, import_run_id, rule_set_id);
create index order_delivery_assessments_outcome on public.order_delivery_assessments(import_run_id, applied_scope, delivery_flag);

alter table public.brazilian_states enable row level security;
alter table public.logistics_sla enable row level security;
alter table public.wismo_rule_sets enable row level security;
alter table public.order_delivery_assessments enable row level security;
revoke all on public.brazilian_states, public.logistics_sla, public.wismo_rule_sets, public.order_delivery_assessments from anon, authenticated;
