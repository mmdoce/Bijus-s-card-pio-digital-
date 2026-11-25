create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  guest_order_id uuid references private.guest_order_tokens(order_id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth_secret text not null check (auth_secret ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (num_nonnulls(profile_id, guest_order_id) = 1),
  check (revoked_at is null or revoked_at >= created_at)
);
create unique index push_profile_endpoint_uidx on public.push_subscriptions (profile_id, endpoint) where profile_id is not null;
create unique index push_guest_endpoint_uidx on public.push_subscriptions (guest_order_id, endpoint) where guest_order_id is not null;

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  order_history_id uuid not null unique references public.order_status_history(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table private.notification_deliveries (
  event_id uuid not null references public.notification_events(id) on delete restrict,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (event_id, subscription_id)
);
create index notification_delivery_queue_idx on private.notification_deliveries (next_attempt_at) where state = 'pending';
