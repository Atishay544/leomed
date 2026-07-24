-- ============================================================
-- Initial ecom schema
-- ============================================================

-- Profiles (extends auth.users)
create table public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  full_name   text,
  avatar_url  text,
  phone       text,
  role        text not null default 'customer' check (role in ('customer', 'admin')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Categories
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  parent_id   uuid references public.categories(id),
  image_url   text,
  sort_order  integer default 0
);

-- Products
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,
  description   text,
  price         numeric(10,2) not null check (price >= 0),
  compare_price numeric(10,2),
  stock         integer not null default 0 check (stock >= 0),
  images        text[] default '{}',
  category_id   uuid references public.categories(id),
  is_active     boolean default true,
  metadata      jsonb default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Cart items (persistent, server-side)
create table public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  product_id  uuid references public.products(id) on delete cascade not null,
  quantity    integer not null check (quantity > 0),
  created_at  timestamptz default now(),
  unique(user_id, product_id)
);

-- Orders
create table public.orders (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id),
  status                   text not null default 'pending'
    check (status in ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  subtotal                 numeric(10,2) not null,
  tax                      numeric(10,2) not null default 0,
  shipping                 numeric(10,2) not null default 0,
  total                    numeric(10,2) not null,
  stripe_payment_intent_id text unique,
  shipping_address         jsonb not null,
  metadata                 jsonb default '{}',
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- Order line items
create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete cascade not null,
  product_id  uuid references public.products(id),
  quantity    integer not null check (quantity > 0),
  unit_price  numeric(10,2) not null,
  total       numeric(10,2) not null,
  snapshot    jsonb not null
);

-- Fraud log (security layer)
create table public.fraud_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id),
  ip         text,
  reason     text not null,
  metadata   jsonb default '{}',
  reviewed   boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index on public.products(slug);
create index on public.products(category_id);
create index on public.products(is_active);
create index on public.cart_items(user_id);
create index on public.orders(user_id);
create index on public.orders(status);
create index on public.orders(stripe_payment_intent_id);
create index on public.order_items(order_id);
create index on public.fraud_log(user_id);
create index on public.fraud_log(reviewed);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.cart_items  enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.fraud_log   enable row level security;

-- profiles
create policy "Users view own profile"    on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile"  on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile"  on public.profiles for insert with check (auth.uid() = id);
create policy "Admins manage profiles"    on public.profiles for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- categories: public read
create policy "Public read categories"   on public.categories for select using (true);
create policy "Admins manage categories" on public.categories for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- products: public read active, admin write
create policy "Public read active products" on public.products for select using (is_active = true);
create policy "Admins manage products"      on public.products for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- cart
create policy "Users manage own cart" on public.cart_items for all using (auth.uid() = user_id);

-- orders
create policy "Users view own orders"    on public.orders for select using (auth.uid() = user_id);
create policy "Users create orders"      on public.orders for insert with check (auth.uid() = user_id);
create policy "Admins manage all orders" on public.orders for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- order_items
create policy "Users view own order items" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "Admins manage order items" on public.order_items for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- fraud_log: admins only
create policy "Admins only fraud log" on public.fraud_log for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ============================================================
-- Atomic stock reservation (prevents overselling)
-- ============================================================
create or replace function public.reserve_stock(
  p_product_id uuid,
  p_quantity   integer
) returns boolean
language plpgsql
security definer
as $$
declare v_stock integer;
begin
  select stock into v_stock from public.products where id = p_product_id for update;
  if v_stock < p_quantity then return false; end if;
  update public.products set stock = stock - p_quantity, updated_at = now() where id = p_product_id;
  return true;
end;
$$;

-- ============================================================
-- Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
