alter table public.manager_import_runs add column if not exists marketing_rows integer not null default 0;

create table public.marketing_campaign_metrics (
  id bigint generated always as identity primary key,
  import_run_id uuid not null references public.manager_import_runs(id) on delete cascade,
  channel text not null,
  category_focus text not null,
  attribution text not null,
  campaign_status text not null,
  campaign_count integer not null check (campaign_count >= 0),
  spend_cents bigint not null check (spend_cents >= 0),
  impressions bigint not null check (impressions >= 0),
  clicks bigint not null check (clicks >= 0),
  conversions bigint not null check (conversions >= 0),
  revenue_cents bigint not null check (revenue_cents >= 0),
  unique(import_run_id, channel, category_focus, attribution, campaign_status)
);

alter table public.marketing_campaign_metrics enable row level security;
revoke all on public.marketing_campaign_metrics from anon, authenticated;

create or replace function public.get_manager_marketing_kpis(p_category text default null)
returns jsonb language sql stable security definer set search_path=public as $$
with latest as (
  select id from manager_import_runs where status='completed' order by finished_at desc nulls last limit 1
), base as (
  select m.* from marketing_campaign_metrics m join latest l on l.id=m.import_run_id
  where p_category is null or m.category_focus=p_category
)
select jsonb_build_object(
  'source','historical',
  'campaigns',coalesce((select sum(campaign_count) from base),0),
  'spendCents',coalesce((select sum(spend_cents) from base),0),
  'impressions',coalesce((select sum(impressions) from base),0),
  'clicks',coalesce((select sum(clicks) from base),0),
  'conversions',coalesce((select sum(conversions) from base),0),
  'revenueCents',coalesce((select sum(revenue_cents) from base),0),
  'byChannel',coalesce((select jsonb_agg(x order by revenue_cents desc) from (select channel,sum(campaign_count) campaigns,sum(spend_cents) spend_cents,sum(impressions) impressions,sum(clicks) clicks,sum(conversions) conversions,sum(revenue_cents) revenue_cents from base group by channel) x),'[]'::jsonb),
  'byCategory',coalesce((select jsonb_agg(x order by revenue_cents desc) from (select category_focus category,sum(campaign_count) campaigns,sum(spend_cents) spend_cents,sum(conversions) conversions,sum(revenue_cents) revenue_cents from base group by category_focus) x),'[]'::jsonb),
  'byAttribution',coalesce((select jsonb_agg(x order by revenue_cents desc) from (select attribution,sum(campaign_count) campaigns,sum(spend_cents) spend_cents,sum(conversions) conversions,sum(revenue_cents) revenue_cents from base group by attribution) x),'[]'::jsonb)
);
$$;

revoke execute on function public.get_manager_marketing_kpis(text) from public, anon, authenticated;
grant execute on function public.get_manager_marketing_kpis(text) to service_role;
