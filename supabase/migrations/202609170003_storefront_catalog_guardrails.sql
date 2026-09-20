-- O storefront usa uma vitrine curada e pequena. O restante da importacao
-- continua disponivel para analises, mas nao deve virar catalogo comercial.
create or replace function public.get_storefront_products()
returns jsonb language sql stable security definer set search_path=public as $$
with latest_run as (
  select id from public.data_import_runs
  where status = 'completed'
  order by finished_at desc nulls last limit 1
), ranked_products as (
  select p.*, row_number() over (
    partition by p.category, p.subcategory
    order by p.is_curated desc, p.title, p.id
  ) as subcategory_rank
  from public.products p join latest_run r on r.id = p.import_run_id
), storefront_products as (
  select p.* from ranked_products p
  where p.is_curated
     or (p.category = 'Beleza' and p.subcategory in ('Blush', 'Batom') and p.subcategory_rank <= 2)
     or (p.category = 'Acessórios' and p.subcategory in ('Bolsa de Couro', 'Brinco') and p.subcategory_rank <= 1)
     or (p.category = 'Lifestyle' and p.subcategory in ('Caderno', 'Almofada') and p.subcategory_rank <= 1)
)
select coalesce(jsonb_agg(product order by product->>'category', product->>'title'),'[]'::jsonb)
from (
  select jsonb_build_object(
    'id',p.id,'title',p.title,'handle',p.handle,'subtitle',p.subtitle,'description',p.description,
    'category',p.category,'subcategory',p.subcategory,'productKind',p.product_kind,'variantAttribute',p.variant_attribute,
    'color',p.color,'accent',p.accent,'badge',p.badge,'imageKey',p.image_key,
    'variants',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'title',v.title,'sku',v.source_sku,'size',v.size,'price',v.price_cents,
      'returnRate',coalesce(v.return_rate,0),'defectRate',coalesce(v.defect_rate,0),'salesCount',coalesce(v.sales_count,0),'evidenceOrigin',v.attributes_origin
    ) order by coalesce(v.size,v.title)) from public.product_variants v
    join public.data_import_runs vr on vr.id=v.import_run_id and vr.status='completed'
    where v.product_id=p.id),'[]'::jsonb)
  ) product
  from storefront_products p
) q;
$$;

revoke execute on function public.get_storefront_products() from public,anon,authenticated;
grant execute on function public.get_storefront_products() to service_role;
