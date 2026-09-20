create table public.manager_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_hash text not null unique,
  schema_version text not null,
  customer_rows integer not null default 0,
  service_rows integer not null default 0,
  status text not null check (status in ('staging','completed','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_summary text
);

create table public.customer_segment_snapshots (
  id bigint generated always as identity primary key,
  import_run_id uuid not null references public.manager_import_runs(id) on delete cascade,
  segment_rfm text not null,
  loyalty_level text not null,
  state text not null,
  primary_device text not null,
  customer_count integer not null check (customer_count >= 0),
  total_ltv_cents bigint not null,
  total_historical_orders bigint not null,
  unique(import_run_id, segment_rfm, loyalty_level, state, primary_device)
);

create table public.service_daily_metrics (
  id bigint generated always as identity primary key,
  import_run_id uuid not null references public.manager_import_runs(id) on delete cascade,
  opened_on date not null,
  entry_channel text not null,
  issue_category text not null,
  service_status text not null,
  ticket_count integer not null check (ticket_count >= 0),
  wismo_count integer not null check (wismo_count >= 0),
  csat_sum numeric not null default 0,
  csat_count integer not null default 0,
  first_response_minutes_sum numeric not null default 0,
  first_response_count integer not null default 0,
  operational_cost_cents bigint not null default 0,
  unique(import_run_id, opened_on, entry_channel, issue_category, service_status)
);

alter table public.anonymous_sessions add column demo_seed_version text;
create index anonymous_sessions_demo_seed on public.anonymous_sessions(demo_seed_version) where is_demo is true;

create table public.demo_seed_runs (
  version text primary key,
  event_count integer not null check (event_count > 0),
  horizon_days integer not null check (horizon_days > 0),
  seeded_at timestamptz not null default now()
);

alter table public.manager_import_runs enable row level security;
alter table public.customer_segment_snapshots enable row level security;
alter table public.service_daily_metrics enable row level security;
alter table public.demo_seed_runs enable row level security;
revoke all on public.manager_import_runs, public.customer_segment_snapshots, public.service_daily_metrics, public.demo_seed_runs from anon, authenticated;

create or replace function public.get_manager_dashboard(
  p_from date default null,
  p_to date default null,
  p_channel text default null,
  p_category text default null,
  p_origin text default 'all'
) returns jsonb language sql stable security definer set search_path=public as $$
with latest_case as (
  select id from data_import_runs where status='completed' order by finished_at desc nulls last limit 1
), latest_manager as (
  select id from manager_import_runs where status='completed' order by finished_at desc nulls last limit 1
), sales as (
  select o.id as order_id,o.ordered_at::date as sale_day,coalesce(o.channel,'Não informado') as channel,
    p.category,p.title,oi.quantity,coalesce(oi.net_revenue_cents,0) revenue,
    coalesce(oi.contribution_margin_cents,0) margin,(r.id is not null)::int returned
  from orders o join latest_case l on l.id=o.import_run_id
  join order_items oi on oi.order_id=o.id join product_variants v on v.id=oi.variant_id
  join products p on p.id=v.product_id left join returns r on r.order_item_id=oi.id
  where (p_from is null or o.ordered_at::date>=p_from) and (p_to is null or o.ordered_at::date<=p_to)
    and (p_channel is null or o.channel=p_channel) and (p_category is null or p.category=p_category)
), latest_inventory as (
  select distinct on (s.variant_id) s.variant_id,s.available_quantity,s.availability_status,v.price_cents,p.category
  from inventory_snapshots s join latest_case l on l.id=s.import_run_id
  join product_variants v on v.id=s.variant_id join products p on p.id=v.product_id
  where p_category is null or p.category=p_category order by s.variant_id,s.captured_at desc
), customer_base as (
  select c.* from customer_segment_snapshots c join latest_manager l on l.id=c.import_run_id
), service_base as (
  select s.* from service_daily_metrics s join latest_manager l on l.id=s.import_run_id
  where (p_from is null or s.opened_on>=p_from) and (p_to is null or s.opened_on<=p_to)
), interactions as (
  select i.*,p.title product,p.category,coalesce(vs.size,'—') selected_size,vr.size recommended_size,
    rs.version rule_version,case when s.is_demo then 'demo' else 'historical' end origin,
    d.decision,d.decided_at,a.status agent_status,a.provider,a.latency_ms
  from mipo_interventions i join anonymous_sessions s on s.id=i.session_id
  join products p on p.id=i.product_id join product_variants vs on vs.id=i.selected_variant_id
  left join product_variants vr on vr.id=i.recommended_variant_id join mipo_rule_sets rs on rs.id=i.rule_set_id
  left join mipo_decisions d on d.intervention_id=i.id left join mipo_agent_runs a on a.intervention_id=i.id
  where (p_from is null or i.created_at::date>=p_from) and (p_to is null or i.created_at::date<=p_to)
    and (p_category is null or p.category=p_category)
    and (p_origin='all' or (p_origin='demo' and s.is_demo) or (p_origin='historical' and not s.is_demo))
), interaction_status as (
  select *,case when decision is not null then decision::text when created_at<now()-interval '30 minutes' then 'abandoned' else 'pending' end decision_status
  from interactions
)
select jsonb_build_object(
  'generatedAt',now(),
  'filters',jsonb_build_object('from',p_from,'to',p_to,'channel',p_channel,'category',p_category,'origin',p_origin),
  'historicalWindow',(select jsonb_build_object('from',min(ordered_at),'to',max(ordered_at)) from orders o join latest_case l on l.id=o.import_run_id),
  'options',jsonb_build_object(
    'channels',coalesce((select jsonb_agg(x) from (select distinct channel as value from sales order by channel) x),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(x) from (select distinct category as value from sales order by category) x),'[]'::jsonb)
  ),
  'executive',jsonb_build_object(
    'source','historical','revenueCents',coalesce((select sum(revenue) from sales),0),'marginCents',coalesce((select sum(margin) from sales),0),
    'orders',coalesce((select count(distinct order_id) from sales),0),'returns',coalesce((select sum(returned) from sales),0),
    'criticalSkus',coalesce((select count(*) from latest_inventory where availability_status in ('Crítico','Ruptura') or available_quantity<=3),0),
    'inventoryExposureCents',coalesce((select sum(greatest(available_quantity,0)*price_cents) from latest_inventory),0),
    'monthly',coalesce((select jsonb_agg(x order by month) from (select to_char(date_trunc('month',sale_day),'YYYY-MM') as month,sum(revenue) as revenue_cents,sum(margin) as margin_cents,count(distinct order_id) as orders,sum(returned) as returns from sales group by 1) x),'[]'::jsonb),
    'channels',coalesce((select jsonb_agg(x order by revenue_cents desc) from (select channel,sum(revenue) revenue_cents,sum(margin) margin_cents,count(distinct order_id) orders,sum(returned) returns from sales group by channel) x),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(x order by margin_cents desc) from (select title product,category,sum(revenue) revenue_cents,sum(margin) margin_cents,sum(returned) returns from sales group by title,category order by sum(margin) desc limit 10) x),'[]'::jsonb),
    'inventory',coalesce((select jsonb_agg(x order by sku_count desc) from (select availability_status status,count(*) sku_count,sum(greatest(available_quantity,0)*price_cents) exposure_cents from latest_inventory group by availability_status) x),'[]'::jsonb)
  ),
  'customers',jsonb_build_object(
    'source','snapshot','total',coalesce((select sum(customer_count) from customer_base),0),
    'segments',coalesce((select jsonb_agg(x order by customers desc) from (select segment_rfm label,sum(customer_count) customers,round(sum(total_ltv_cents)::numeric/nullif(sum(customer_count),0)) average_ltv_cents,round(sum(total_historical_orders)::numeric/nullif(sum(customer_count),0),1) average_orders from customer_base group by segment_rfm) x),'[]'::jsonb),
    'loyalty',coalesce((select jsonb_agg(x order by customers desc) from (select loyalty_level label,sum(customer_count) customers from customer_base group by loyalty_level) x),'[]'::jsonb),
    'states',coalesce((select jsonb_agg(x order by customers desc) from (select state label,sum(customer_count) customers from customer_base group by state order by sum(customer_count) desc limit 10) x),'[]'::jsonb),
    'devices',coalesce((select jsonb_agg(x order by customers desc) from (select primary_device label,sum(customer_count) customers from customer_base group by primary_device) x),'[]'::jsonb)
  ),
  'service',jsonb_build_object(
    'source','historical','tickets',coalesce((select sum(ticket_count) from service_base),0),'wismo',coalesce((select sum(wismo_count) from service_base),0),
    'csat',coalesce((select round(sum(csat_sum)/nullif(sum(csat_count),0),2) from service_base),0),
    'firstResponseMinutes',coalesce((select round(sum(first_response_minutes_sum)/nullif(sum(first_response_count),0),1) from service_base),0),
    'costCents',coalesce((select sum(operational_cost_cents) from service_base),0),
    'backlog',coalesce((select sum(ticket_count) from service_base where lower(service_status) not in ('resolvido','fechado','concluído','concluido')),0),
    'weekly',coalesce((select jsonb_agg(x order by week) from (select to_char(date_trunc('week',opened_on),'YYYY-MM-DD') week,sum(ticket_count) tickets,sum(wismo_count) wismo,round(sum(csat_sum)/nullif(sum(csat_count),0),2) csat from service_base group by 1) x),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(x order by tickets desc) from (select issue_category label,sum(ticket_count) tickets,sum(wismo_count) wismo from service_base group by issue_category order by sum(ticket_count) desc limit 10) x),'[]'::jsonb)
  ),
  'mipo',jsonb_build_object(
    'source',case when p_origin='demo' then 'demo' else 'historical' end,'evaluated',(select count(*) from interaction_status),
    'actionable',(select count(*) from interaction_status where recommended_variant_id is not null),
    'decided',(select count(*) from interaction_status where decision_status in ('accepted','kept_original')),
    'accepted',(select count(*) from interaction_status where decision_status='accepted'),
    'risks',coalesce((select jsonb_agg(x order by count desc) from (select risk_type label,count(*) count from interaction_status group by risk_type) x),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(x order by "day") from (select created_at::date as "day",count(*) as interventions,count(*) filter(where decision_status='accepted') as accepted from interaction_status group by 1) x),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(x order by occurred_at desc) from (select id,created_at occurred_at,product,category,selected_size,recommended_size,risk_type risk,risk_level level,nullif(evidence->>'score','')::integer score,coalesce(evidence->>'message',message) || case when evidence->>'score' is not null then ' Score determinístico: ' || (evidence->>'score') || '/100.' else '' end evidence,rule_version,decision_status decision,origin,agent_status from interaction_status order by created_at desc limit 100) x),'[]'::jsonb)
  ),
  'agent',jsonb_build_object(
    'source',case when p_origin='demo' then 'demo' else 'historical' end,'total',(select count(*) from interaction_status where agent_status is not null),
    'eloagents',(select count(*) from interaction_status where agent_status='eloagents_succeeded'),'groq',(select count(*) from interaction_status where agent_status='groq_succeeded'),
    'fallback',(select count(*) from interaction_status where agent_status='deterministic_fallback'),'cacheHits',(select count(*) from interaction_status where agent_status='cache_hit'),
    'rejected',(select count(*) from interaction_status where agent_status='rejected_by_policy'),
    'timeouts',(select count(*) from interaction_status where agent_status='deterministic_fallback'),
    'averageLatencyMs',(select round(avg(latency_ms)) from interaction_status where latency_ms is not null),
    'providers',coalesce((select jsonb_agg(x order by count desc) from (select coalesce(provider,'none') label,count(*) count from interaction_status where agent_status is not null group by provider) x),'[]'::jsonb)
  )
);
$$;

revoke execute on function public.get_manager_dashboard(date,date,text,text,text) from public,anon,authenticated;
grant execute on function public.get_manager_dashboard(date,date,text,text,text) to service_role;

create or replace function public.reset_demo_data(apply_reset boolean default false, seed_version text default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'seed_version',seed_version,
    'sessions',(select count(*) from anonymous_sessions where is_demo and (seed_version is null or demo_seed_version=seed_version)),
    'carts',(select count(*) from carts c join anonymous_sessions s on s.id=c.session_id where s.is_demo and (seed_version is null or s.demo_seed_version=seed_version)),
    'interventions',(select count(*) from mipo_interventions i join anonymous_sessions s on s.id=i.session_id where s.is_demo and (seed_version is null or s.demo_seed_version=seed_version)),
    'decisions',(select count(*) from mipo_decisions d join anonymous_sessions s on s.id=d.session_id where s.is_demo and (seed_version is null or s.demo_seed_version=seed_version)),
    'agent_runs',(select count(*) from mipo_agent_runs a join mipo_interventions i on i.id=a.intervention_id join anonymous_sessions s on s.id=i.session_id where s.is_demo and (seed_version is null or s.demo_seed_version=seed_version))
  ) into result;
  if apply_reset then
    delete from anonymous_sessions where is_demo and (seed_version is null or demo_seed_version=seed_version);
    if seed_version is not null then delete from demo_seed_runs where version=seed_version; end if;
  end if;
  return result;
end;
$$;
revoke execute on function public.reset_demo_data(boolean,text) from public,anon,authenticated;
grant execute on function public.reset_demo_data(boolean,text) to service_role;
