-- Curadoria demonstrativa de preços coerentes com o posicionamento editorial Vértice.
-- Mantém os valores importados de pedidos históricos intactos; altera apenas o catálogo atual.
update public.product_variants v
set price_cents = case p.handle
  when 'vestido-aurora' then 64900
  when 'vestido-sereno' then 57900
  when 'blusa-trama' then 28900
  when 'calca-eixo' then 44900
  when 'jaqueta-lume' then 62900
  when 'casaco-orbita' then 74900
  when 'blush-bruma' then 12900
  when 'balm-luz' then 8900
  else v.price_cents
end
from public.products p
where p.id = v.product_id
  and p.handle in ('vestido-aurora','vestido-sereno','blusa-trama','calca-eixo','jaqueta-lume','casaco-orbita','blush-bruma','balm-luz');
