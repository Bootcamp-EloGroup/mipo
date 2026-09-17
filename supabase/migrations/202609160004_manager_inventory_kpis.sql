create or replace function public.get_manager_inventory_kpis(p_category text default null)
returns jsonb language sql stable security definer set search_path=public as $$
with latest_case as (
  select id from data_import_runs where status='completed' order by finished_at desc nulls last limit 1
), latest_inventory as (
  select distinct on (s.variant_id) s.variant_id,s.available_quantity,s.availability_status,v.price_cents,p.category
  from inventory_snapshots s join latest_case l on l.id=s.import_run_id
  join product_variants v on v.id=s.variant_id join products p on p.id=v.product_id
  where p_category is null or p.category=p_category order by s.variant_id,s.captured_at desc
)
select jsonb_build_object(
  'criticalSkus',count(*) filter(where availability_status in ('Estoque Crítico','Ruptura') or available_quantity<=3),
  'inventoryExposureCents',coalesce(sum(greatest(available_quantity,0)*price_cents),0)
) from latest_inventory;
$$;
revoke execute on function public.get_manager_inventory_kpis(text) from public,anon,authenticated;
grant execute on function public.get_manager_inventory_kpis(text) to service_role;
