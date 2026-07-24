-- ============================================================
-- Coupons
-- ============================================================
create table public.coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  type          text not null check (type in ('percentage', 'flat')),
  value         numeric(10,2) not null check (value > 0),
  min_order     numeric(10,2) default 0,
  max_uses      integer,
  uses_count    integer not null default 0,
  expires_at    timestamptz,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

alter table public.coupons enable row level security;
create policy "Admins manage coupons" on public.coupons for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
-- Allow authenticated users to look up a coupon code (for validation at checkout)
create policy "Users can validate coupons" on public.coupons for select using (
  is_active = true and (expires_at is null or expires_at > now()) and (max_uses is null or uses_count < max_uses)
);

-- ============================================================
-- Announcements (banner bar)
-- ============================================================
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  message     text not null,
  link_url    text,
  link_text   text,
  bg_color    text default '#000000',
  text_color  text default '#ffffff',
  is_active   boolean default false,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz default now()
);

alter table public.announcements enable row level security;
create policy "Public read active announcements" on public.announcements for select using (
  is_active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
);
create policy "Admins manage announcements" on public.announcements for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ============================================================
-- Product Reviews
-- ============================================================
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid references public.products(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade not null,
  rating      integer not null check (rating between 1 and 5),
  title       text,
  body        text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz default now(),
  unique(product_id, user_id)
);

alter table public.reviews enable row level security;
create policy "Public read approved reviews" on public.reviews for select using (status = 'approved');
create policy "Users create own review"      on public.reviews for insert with check (auth.uid() = user_id);
create policy "Users view own review"        on public.reviews for select using (auth.uid() = user_id);
create policy "Admins manage reviews"        on public.reviews for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ============================================================
-- Wishlist
-- ============================================================
create table public.wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  product_id  uuid references public.products(id) on delete cascade not null,
  created_at  timestamptz default now(),
  unique(user_id, product_id)
);

alter table public.wishlist_items enable row level security;
create policy "Users manage own wishlist" on public.wishlist_items for all using (auth.uid() = user_id);

-- ============================================================
-- Saved Addresses
-- ============================================================
create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  label       text,          -- "Home", "Work", etc.
  full_name   text not null,
  line1       text not null,
  line2       text,
  city        text not null,
  state       text not null,
  postal_code text not null,
  country     text not null default 'IN',
  phone       text,
  is_default  boolean default false,
  created_at  timestamptz default now()
);

alter table public.addresses enable row level security;
create policy "Users manage own addresses" on public.addresses for all using (auth.uid() = user_id);

-- ============================================================
-- Notifications
-- ============================================================
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  type        text not null,   -- 'order_update', 'promo', 'review_approved', etc.
  title       text not null,
  body        text,
  link        text,
  is_read     boolean default false,
  created_at  timestamptz default now()
);

alter table public.notifications enable row level security;
create policy "Users manage own notifications" on public.notifications for all using (auth.uid() = user_id);

-- ============================================================
-- Live Chat
-- ============================================================
create table public.chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id),
  guest_name   text,
  guest_email  text,
  status       text not null default 'open' check (status in ('open', 'assigned', 'closed')),
  assigned_to  uuid references auth.users(id),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table public.chat_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references public.chat_sessions(id) on delete cascade not null,
  sender_id   uuid references auth.users(id),
  sender_role text not null check (sender_role in ('customer', 'agent', 'bot')),
  body        text not null,
  is_read     boolean default false,
  created_at  timestamptz default now()
);

alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users see own chat sessions"    on public.chat_sessions for select using (auth.uid() = user_id);
create policy "Users create chat session"      on public.chat_sessions for insert with check (true);
create policy "Admins manage chat sessions"    on public.chat_sessions for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Users see own messages"         on public.chat_messages for select using (
  exists (select 1 from public.chat_sessions s where s.id = session_id and s.user_id = auth.uid())
);
create policy "Anyone can send messages"       on public.chat_messages for insert with check (true);
create policy "Admins manage chat messages"    on public.chat_messages for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ============================================================
-- Product Variants
-- ============================================================
create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid references public.products(id) on delete cascade not null,
  name        text not null,    -- e.g. "Size / Color"
  options     jsonb not null,   -- [{ "size": "M", "color": "Red", "stock": 10, "price_delta": 0 }]
  created_at  timestamptz default now()
);

alter table public.product_variants enable row level security;
create policy "Public read variants"     on public.product_variants for select using (true);
create policy "Admins manage variants"   on public.product_variants for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ============================================================
-- Indexes
-- ============================================================
create index on public.reviews(product_id, status);
create index on public.wishlist_items(user_id);
create index on public.addresses(user_id);
create index on public.notifications(user_id, is_read);
create index on public.chat_sessions(status);
create index on public.chat_messages(session_id);
create index on public.coupons(code);
