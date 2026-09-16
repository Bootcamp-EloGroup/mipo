alter table public.products add column product_kind text not null default 'lifestyle' check (product_kind in ('apparel','beauty','accessory','lifestyle'));
alter table public.products add column variant_attribute text not null default 'none' check (variant_attribute in ('size','shade','color','volume','none'));
alter table public.anonymous_sessions add column is_demo boolean not null default false;

update public.products set product_kind=case category when 'Moda' then 'apparel' when 'Beleza' then 'beauty' when 'Acessórios' then 'accessory' else 'lifestyle' end,
  variant_attribute=case when category='Moda' then 'size' else 'none' end;

with latest as (select id from public.data_import_runs where status='completed' order by finished_at desc nulls last limit 1), ranked as (
  select p.id,row_number() over(order by sum(v.sales_count) desc,p.title,p.id) position from public.products p join latest l on l.id=p.import_run_id join public.product_variants v on v.product_id=p.id
  where p.category='Moda' group by p.id having count(v.id)=4
), selected as (select id from ranked where position<=6)
update public.products p set is_curated=exists(select 1 from selected s where s.id=p.id) where p.import_run_id=(select id from latest);

update public.product_variants v set size=null where v.import_run_id=(select id from public.data_import_runs where status='completed' order by finished_at desc nulls last limit 1);
with chosen as (
  select v.id,row_number() over(partition by v.product_id order by v.source_sku) position from public.product_variants v join public.products p on p.id=v.product_id
  where p.is_curated and p.category='Moda' and p.import_run_id=(select id from public.data_import_runs where status='completed' order by finished_at desc nulls last limit 1)
)
update public.product_variants v set size=case c.position when 1 then 'P' when 2 then 'M' when 3 then 'G' when 4 then 'GG' end,attributes_origin='synthetic' from chosen c where c.id=v.id;

create or replace function public.get_storefront_products() returns jsonb language sql stable security definer set search_path=public as $$
select coalesce(jsonb_agg(product order by product->>'title'),'[]'::jsonb) from (select jsonb_build_object(
  'id',p.id,'title',p.title,'handle',p.handle,'subtitle',p.subtitle,'description',p.description,'category',p.category,'subcategory',p.subcategory,'productKind',p.product_kind,'variantAttribute',p.variant_attribute,
  'color',p.color,'accent',p.accent,'badge',p.badge,'imageKey',p.image_key,'variants',coalesce((select jsonb_agg(jsonb_build_object(
    'id',v.id,'title',v.title,'sku',v.source_sku,'size',v.size,'price',v.price_cents,'salesCount',v.sales_count,
    'inventory_quantity',coalesce((select s.available_quantity from public.inventory_snapshots s join public.data_import_runs sr on sr.id=s.import_run_id where s.variant_id=v.id and sr.status='completed' order by s.captured_at desc limit 1),0),
    'returnRate',v.return_rate,'defectRate',v.defect_rate,'evidenceOrigin',v.attributes_origin) order by case v.size when 'P' then 1 when 'M' then 2 when 'G' then 3 else 4 end)
    from public.product_variants v join public.data_import_runs vr on vr.id=v.import_run_id and vr.status='completed' where v.product_id=p.id),'[]'::jsonb)) product
  from public.products p join public.data_import_runs pr on pr.id=p.import_run_id and pr.status='completed'
  where p.is_curated and p.product_kind='apparel' and p.variant_attribute='size' and p.import_run_id=(select id from public.data_import_runs where status='completed' order by finished_at desc nulls last limit 1)) q;
$$;
revoke execute on function public.get_storefront_products() from public,anon,authenticated;
grant execute on function public.get_storefront_products() to service_role;

create or replace function public.reset_demo_data(apply_reset boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  select jsonb_build_object('sessions',(select count(*) from public.anonymous_sessions where is_demo is true),'carts',(select count(*) from public.carts c join public.anonymous_sessions s on s.id=c.session_id where s.is_demo is true),'interventions',(select count(*) from public.mipo_interventions i join public.anonymous_sessions s on s.id=i.session_id where s.is_demo is true),'decisions',(select count(*) from public.mipo_decisions d join public.anonymous_sessions s on s.id=d.session_id where s.is_demo is true)) into result;
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
