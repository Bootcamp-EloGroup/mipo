create table if not exists public.mipo_fit_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.anonymous_sessions(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid not null references public.product_variants(id),
  rating text not null check (rating in ('tight','ideal','loose')),
  created_at timestamptz not null default now()
);
comment on table public.mipo_fit_feedback is 'Feedback de caimento sem medidas corporais brutas.';
create index if not exists mipo_fit_feedback_product_created_idx on public.mipo_fit_feedback(product_id, created_at desc);
alter table public.mipo_fit_feedback enable row level security;
