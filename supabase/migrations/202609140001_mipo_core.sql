create extension if not exists pgcrypto;

create type public.import_status as enum ('validating','staging','completed','failed');
create type public.data_origin as enum ('provided','derived','synthetic');
create type public.mipo_decision_kind as enum ('accepted','kept_original','not_required');

create table public.data_import_runs (
  id uuid primary key default gen_random_uuid(),
  file_hash text not null unique,
  schema_version text not null,
  status public.import_status not null default 'validating',
  accepted_rows integer not null default 0,
  rejected_rows integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_summary text
);

create table public.import_rejections (
  id bigint generated always as identity primary key,
  import_run_id uuid not null references public.data_import_runs(id) on delete cascade,
  source_name text not null,
  row_number integer not null,
  reason text not null,
  row_fingerprint text not null,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key,
  source_key text not null,
  title text not null,
  handle text not null,
  subtitle text,
  description text,
  category text not null,
  subcategory text,
  color text not null default '#4e5841',
  accent text not null default '#e7e5dc',
  badge text,
  image_key text not null default 'sand',
  is_curated boolean not null default false,
  origin public.data_origin not null default 'derived',
  import_run_id uuid references public.data_import_runs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_source_per_import on public.products(source_key, import_run_id);
create unique index products_handle_per_import on public.products(handle, import_run_id);

create table public.product_variants (
  id uuid primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  source_sku text not null,
  title text not null,
  size text check (size in ('P','M','G','GG')),
  color_name text,
  price_cents integer not null check (price_cents >= 0),
  return_rate numeric(7,6),
  defect_rate numeric(7,6),
  attributes_origin public.data_origin not null default 'provided',
  import_run_id uuid references public.data_import_runs(id),
  created_at timestamptz not null default now()
);
create unique index variants_sku_per_import on public.product_variants(source_sku, import_run_id);

create table public.inventory_snapshots (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  captured_at timestamptz not null,
  physical_quantity integer not null,
  reserved_quantity integer not null,
  available_quantity integer not null,
  availability_status text not null,
  captured_at_origin public.data_origin not null default 'derived',
  import_run_id uuid not null references public.data_import_runs(id),
  unique (variant_id, import_run_id),
  check (physical_quantity - reserved_quantity = available_quantity)
);

create table public.orders (
  id uuid primary key,
  source_order_key text not null,
  ordered_at timestamptz not null,
  channel text,
  payment_status text,
  import_run_id uuid not null references public.data_import_runs(id)
);
create unique index orders_source_per_import on public.orders(source_order_key, import_run_id);

create table public.order_items (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null,
  net_revenue_cents integer,
  contribution_margin_cents integer,
  import_run_id uuid not null references public.data_import_runs(id)
);

create table public.returns (
  id uuid primary key,
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  reason text,
  origin public.data_origin not null default 'derived',
  import_run_id uuid not null references public.data_import_runs(id)
);

create table public.anonymous_sessions (
  id uuid primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.anonymous_sessions(id) on delete cascade,
  currency_code text not null default 'brl',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null,
  mipo_decision public.mipo_decision_kind,
  unique (cart_id, variant_id)
);

create table public.mipo_rule_sets (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  high_return_rate numeric(7,6) not null,
  minimum_improvement numeric(7,6) not null,
  low_stock_quantity integer not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index one_active_mipo_rule_set on public.mipo_rule_sets (is_active) where is_active;

create table public.mipo_interventions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.anonymous_sessions(id),
  product_id uuid not null references public.products(id),
  selected_variant_id uuid not null references public.product_variants(id),
  recommended_variant_id uuid references public.product_variants(id),
  rule_set_id uuid not null references public.mipo_rule_sets(id),
  fit_preference text check (fit_preference in ('fitted','regular','loose')),
  risk_type text not null check (risk_type in ('size','quality','stock','none')),
  risk_level text not null check (risk_level in ('high','medium','low')),
  evidence jsonb not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.mipo_decisions (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null unique references public.mipo_interventions(id),
  session_id uuid not null references public.anonymous_sessions(id),
  decision public.mipo_decision_kind not null,
  decided_at timestamptz not null default now()
);

insert into public.mipo_rule_sets(version, high_return_rate, minimum_improvement, low_stock_quantity, is_active)
values ('2026-09-14.v1', 0.25, 0.08, 3, true);

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
          'price', v.price_cents,
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

revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.get_storefront_products() from public, anon, authenticated;
grant execute on function public.get_storefront_products() to service_role;
alter table public.data_import_runs enable row level security;
alter table public.import_rejections enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_snapshots enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.returns enable row level security;
alter table public.anonymous_sessions enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.mipo_rule_sets enable row level security;
alter table public.mipo_interventions enable row level security;
alter table public.mipo_decisions enable row level security;
