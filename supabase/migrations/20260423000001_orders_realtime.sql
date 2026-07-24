-- Enable Supabase Realtime on the orders table so that client-side
-- OrderStatusWatcher components receive live postgres_changes events
-- when an order row is updated (e.g. by webhook, admin cancel, or status sync).

alter publication supabase_realtime add table public.orders;
