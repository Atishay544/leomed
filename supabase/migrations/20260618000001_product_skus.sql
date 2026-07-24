-- Product SKU combinations: each (Color=Red, Size=Small) pair gets its own stock
create table public.product_skus (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid references public.products(id) on delete cascade not null,
  attributes  jsonb not null,                              -- e.g. {"Color":"Red","Size":"Small"}
  stock       integer not null default 0 check (stock >= 0),
  created_at  timestamptz default now()
);

create index product_skus_product_id_idx on public.product_skus(product_id);

-- RLS: anyone can read, only service role writes
alter table public.product_skus enable row level security;

create policy "product_skus_read" on public.product_skus
  for select using (true);

-- No insert/update/delete policy = service role only (bypasses RLS)

-- RPC: atomically decrement SKU stock (used by checkout)
create or replace function public.decrement_sku_stock(p_sku_id uuid, p_quantity integer)
returns void language plpgsql security definer as $$
begin
  update public.product_skus
  set stock = greatest(stock - p_quantity, 0)
  where id = p_sku_id;
end;
$$;
