with latest as (
  select id from public.data_import_runs where status='completed' order by finished_at desc nulls last limit 1
), candidates as (
  select p.id,p.title,sum(v.sales_count) sales,bool_or(s.available_quantity<=3) has_low_stock
  from public.products p join latest l on l.id=p.import_run_id
  join public.product_variants v on v.product_id=p.id
  join public.inventory_snapshots s on s.variant_id=v.id and s.import_run_id=l.id
  where p.category='Moda'
  group by p.id,p.title
  having count(v.id)=4
), ranked as (
  select *,row_number() over(order by sales desc,title,id) position from candidates
), stock_choice as (
  select id from ranked where has_low_stock and position>5 order by sales desc,title,id limit 1
), selected as (
  select id from ranked where position<=5
  union all select id from stock_choice
  union all select id from ranked where position=6 and not exists(select 1 from stock_choice)
), changed as (
  update public.products p set is_curated=exists(select 1 from selected s where s.id=p.id)
  where p.import_run_id=(select id from latest) returning p.id,p.is_curated
)
update public.product_variants v set size=null
where v.import_run_id=(select id from latest);

with chosen as (
  select v.id,row_number() over(partition by v.product_id order by v.source_sku) position
  from public.product_variants v join public.products p on p.id=v.product_id
  where p.is_curated and p.category='Moda'
    and p.import_run_id=(select id from public.data_import_runs where status='completed' order by finished_at desc nulls last limit 1)
)
update public.product_variants v set size=case c.position when 1 then 'P' when 2 then 'M' when 3 then 'G' when 4 then 'GG' end,attributes_origin='synthetic'
from chosen c where c.id=v.id;
