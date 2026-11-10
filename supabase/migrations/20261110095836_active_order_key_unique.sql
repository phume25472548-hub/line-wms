create unique index if not exists orders_active_order_key_uidx
  on public.orders (order_key)
  where order_key is not null and order_status <> 'CANCELLED';
