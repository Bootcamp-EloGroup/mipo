alter table public.anonymous_sessions
  add column if not exists experiment_group text
  check (experiment_group in ('control','treatment'));

create table if not exists public.pilot_orders (
  id uuid primary key default gen_random_uuid(),
  display_id text not null unique,
  session_id uuid not null references public.anonymous_sessions(id),
  idempotency_key text not null unique,
  experiment_group text not null check (experiment_group in ('control','treatment')),
  item_count integer not null check (item_count > 0),
  total_cents bigint not null check (total_cents >= 0),
  is_demo boolean not null default true,
  completed_at timestamptz not null default now()
);

create table if not exists public.pilot_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pilot_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  intervention_id uuid references public.mipo_interventions(id),
  decision public.mipo_decision_kind,
  unique(order_id, variant_id)
);

create table if not exists public.pilot_order_outcomes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.pilot_orders(id) on delete cascade,
  outcome text not null check (outcome in ('kept','returned')),
  return_reason text,
  return_cost_cents integer not null default 0 check (return_cost_cents >= 0),
  observed_at timestamptz not null,
  source_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.pilot_orders enable row level security;
alter table public.pilot_order_items enable row level security;
alter table public.pilot_order_outcomes enable row level security;
revoke all on public.pilot_orders, public.pilot_order_items, public.pilot_order_outcomes from anon, authenticated;

create or replace function public.get_or_assign_pilot_group(p_session_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare assigned text;
begin
  update anonymous_sessions
  set experiment_group=coalesce(experiment_group,case when get_byte(decode(md5(p_session_id::text),'hex'),0)%2=0 then 'control' else 'treatment' end)
  where id=p_session_id
  returning experiment_group into assigned;
  if assigned is null then raise exception 'Sessão não encontrada'; end if;
  return assigned;
end $$;

create or replace function public.complete_pilot_checkout(p_session_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing pilot_orders%rowtype; created pilot_orders%rowtype; target_cart_id uuid; assigned text; items integer; total bigint;
begin
  select * into existing from pilot_orders where idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('id',existing.id,'displayId',existing.display_id,'group',existing.experiment_group,'itemCount',existing.item_count,'totalCents',existing.total_cents,'completedAt',existing.completed_at); end if;
  select id into target_cart_id from carts where session_id=p_session_id for update;
  if target_cart_id is null then raise exception 'Sacola não encontrada'; end if;
  select coalesce(sum(quantity),0),coalesce(sum(quantity*unit_price_cents),0) into items,total from cart_items where cart_items.cart_id=target_cart_id;
  if items=0 then raise exception 'Sacola vazia'; end if;
  assigned:=get_or_assign_pilot_group(p_session_id);
  insert into pilot_orders(display_id,session_id,idempotency_key,experiment_group,item_count,total_cents,is_demo)
  values('MIPO-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),p_session_id,p_idempotency_key,assigned,items,total,coalesce((select is_demo from anonymous_sessions where id=p_session_id),true)) returning * into created;
  insert into pilot_order_items(order_id,product_id,variant_id,quantity,unit_price_cents,intervention_id,decision)
  select created.id,v.product_id,ci.variant_id,ci.quantity,ci.unit_price_cents,i.id,d.decision
  from cart_items ci join product_variants v on v.id=ci.variant_id
  left join lateral (select mi.id from mipo_interventions mi where mi.session_id=p_session_id and mi.product_id=v.product_id order by mi.created_at desc limit 1) i on true
  left join mipo_decisions d on d.intervention_id=i.id
  where ci.cart_id=target_cart_id;
  delete from cart_items where cart_items.cart_id=target_cart_id;
  return jsonb_build_object('id',created.id,'displayId',created.display_id,'group',created.experiment_group,'itemCount',created.item_count,'totalCents',created.total_cents,'completedAt',created.completed_at);
end $$;

create or replace function public.get_manager_pilot_kpis()
returns jsonb language sql stable security definer set search_path=public as $$
  with base as (
    select o.experiment_group,o.id,coalesce(x.outcome,'pending') outcome,coalesce(x.return_cost_cents,0) return_cost_cents
    from pilot_orders o left join pilot_order_outcomes x on x.order_id=o.id
  ), grouped as (
    select experiment_group,count(*) orders,count(*) filter(where outcome<>'pending') observed,count(*) filter(where outcome='returned') returns,coalesce(sum(return_cost_cents) filter(where outcome='returned'),0) return_cost_cents
    from base group by experiment_group
  )
  select jsonb_build_object(
    'control',jsonb_build_object('orders',coalesce((select orders from grouped where experiment_group='control'),0),'observed',coalesce((select observed from grouped where experiment_group='control'),0),'returns',coalesce((select returns from grouped where experiment_group='control'),0),'returnCostCents',coalesce((select return_cost_cents from grouped where experiment_group='control'),0)),
    'treatment',jsonb_build_object('orders',coalesce((select orders from grouped where experiment_group='treatment'),0),'observed',coalesce((select observed from grouped where experiment_group='treatment'),0),'returns',coalesce((select returns from grouped where experiment_group='treatment'),0),'returnCostCents',coalesce((select return_cost_cents from grouped where experiment_group='treatment'),0)),
    'readyForComparison',coalesce((select observed from grouped where experiment_group='control'),0)>=30 and coalesce((select observed from grouped where experiment_group='treatment'),0)>=30
  )
$$;

revoke all on function public.get_or_assign_pilot_group(uuid),public.complete_pilot_checkout(uuid,text),public.get_manager_pilot_kpis() from public;
grant execute on function public.get_or_assign_pilot_group(uuid),public.complete_pilot_checkout(uuid,text),public.get_manager_pilot_kpis() to service_role;
