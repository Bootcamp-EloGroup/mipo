-- O storefront mostra o catálogo comercial completo. A curadoria de vestuário
-- continua válida para o MIPO, mas não deve esconder beleza e acessórios.
create or replace function public.get_storefront_products()
returns jsonb language sql stable security definer set search_path=public as $$
select coalesce(jsonb_agg(product order by product->>'title'),'[]'::jsonb)
from (
  select jsonb_build_object(
    'id',p.id,'title',p.title,'handle',p.handle,'subtitle',p.subtitle,'description',p.description,
    'category',p.category,'subcategory',p.subcategory,'productKind',p.product_kind,'variantAttribute',p.variant_attribute,
    'color',p.color,'accent',p.accent,'badge',p.badge,'imageKey',p.image_key,
    'variants',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'title',v.title,'sku',v.source_sku,'size',v.size,'price',v.price_cents,
      'returnRate',coalesce(v.return_rate,0),'defectRate',coalesce(v.defect_rate,0),'salesCount',coalesce(v.sales_count,0),'evidenceOrigin',v.attributes_origin
    ) order by coalesce(v.size,v.title))
    from public.product_variants v
    join public.data_import_runs vr on vr.id=v.import_run_id and vr.status='completed'
    where v.product_id=p.id),'[]'::jsonb)
  ) product
  from public.products p
  join public.data_import_runs pr on pr.id=p.import_run_id and pr.status='completed'
  where p.import_run_id=(select id from public.data_import_runs where status='completed' order by finished_at desc nulls last limit 1)
) q;
$$;

revoke execute on function public.get_storefront_products() from public,anon,authenticated;
grant execute on function public.get_storefront_products() to service_role;
