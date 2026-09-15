alter table public.product_variants add column sales_count integer not null default 0 check (sales_count >= 0);

update public.product_variants v
set sales_count = counts.total
from (
  select variant_id, count(*)::integer as total
  from public.order_items
  group by variant_id
) counts
where counts.variant_id = v.id;

alter table public.mipo_rule_sets add column minimum_sample_size integer not null default 30 check (minimum_sample_size > 0);

alter table public.mipo_interventions drop constraint mipo_interventions_risk_type_check;
alter table public.mipo_interventions add constraint mipo_interventions_risk_type_check
  check (risk_type in ('size','quality','stock','none','insufficient_evidence'));

create or replace function public.get_storefront_products()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(product order by product->>'title'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', p.id, 'title', p.title, 'handle', p.handle, 'subtitle', p.subtitle,
      'description', p.description, 'category', p.category, 'color', p.color,
      'accent', p.accent, 'badge', p.badge, 'imageKey', p.image_key,
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', v.id, 'title', v.title, 'sku', v.source_sku, 'size', v.size,
          'price', v.price_cents, 'salesCount', v.sales_count,
          'inventory_quantity', coalesce((select s.available_quantity from public.inventory_snapshots s join public.data_import_runs r on r.id = s.import_run_id where s.variant_id = v.id and r.status = 'completed' order by s.captured_at desc limit 1), 0),
          'returnRate', v.return_rate, 'defectRate', v.defect_rate,
          'evidenceOrigin', v.attributes_origin
        ) order by case v.size when 'P' then 1 when 'M' then 2 when 'G' then 3 else 4 end)
        from public.product_variants v
        join public.data_import_runs vr on vr.id = v.import_run_id and vr.status = 'completed'
        where v.product_id = p.id
      ), '[]'::jsonb)
    ) as product
    from public.products p
    join public.data_import_runs pr on pr.id = p.import_run_id and pr.status = 'completed'
    where p.is_curated
      and p.import_run_id = (
        select latest.id from public.data_import_runs latest
        where latest.status = 'completed'
        order by latest.finished_at desc nulls last
        limit 1
      )
  ) q;
$$;

revoke execute on function public.get_storefront_products() from public, anon, authenticated;
grant execute on function public.get_storefront_products() to service_role;
