create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create type public.order_status as enum ('AGUARDANDO_PAGAMENTO', 'REVISAO_MANUAL', 'EM_PREPARO', 'PRONTO', 'PRONTO_ENTREGA', 'SAIU_PARA_ENTREGA', 'CONCLUIDO', 'CANCELADO');
create type public.financial_status as enum ('PENDENTE', 'EXPIRADO', 'CONFIRMADO', 'ISENTO', 'CANCELADO', 'REEMBOLSADO');
create type public.receipt_method as enum ('pickup', 'delivery');
create type public.payment_method as enum ('pix', 'receipt');

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  phone text not null check (phone ~ '^\+55[1-9]{2}[2-9][0-9]{7,8}$'),
  created_at timestamptz not null default now()
);
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 100),
  available boolean not null default true,
  display_order integer not null default 0 check (display_order >= 0)
);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null check (char_length(btrim(description)) between 1 and 500),
  price_cents integer not null check (price_cents between 0 and 9999999),
  image_path text check (image_path is null or (char_length(image_path) <= 500
    and image_path ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$' and position('..' in image_path) = 0)),
  size text check (char_length(size) <= 40),
  published boolean not null default true,
  available boolean not null default true,
  earns_stamps boolean not null default false,
  unique (category_id, name)
);
create index products_image_idx on public.products (image_path) where image_path is not null;
create table public.delivery_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 100),
  fee_cents integer not null check (fee_cents between 0 and 9999999),
  available boolean not null default true
);
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  delivery_area_id uuid not null references public.delivery_areas(id) on delete restrict,
  street text not null check (char_length(btrim(street)) between 1 and 120),
  street_number text not null check (char_length(btrim(street_number)) between 1 and 20),
  complement text check (char_length(complement) <= 100),
  reference text check (char_length(reference) <= 160),
  created_at timestamptz not null default now()
);
create index addresses_profile_idx on public.addresses (profile_id);
create index addresses_area_idx on public.addresses (delivery_area_id);
create table public.store_settings (
  id uuid primary key default '00000000-0000-4000-8000-000000000001' check (id = '00000000-0000-4000-8000-000000000001'),
  is_open boolean not null default false,
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+55[1-9]{2}[2-9][0-9]{7,8}$'),
  reward_product_id uuid references public.products(id) on delete restrict,
  updated_at timestamptz not null default now()
);
create table public.payment_settings (
  id uuid primary key default '00000000-0000-4000-8000-000000000001' check (id = '00000000-0000-4000-8000-000000000001'),
  pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'email', 'phone', 'random')),
  pix_key text check (pix_key ~ '^[!-~]{1,77}$'),
  receiver_name text check (receiver_name ~ '^[ -~]{1,25}$' and receiver_name ~ '[A-Za-z]'),
  receiver_city text check (receiver_city ~ '^[ -~]{1,15}$' and receiver_city ~ '[A-Za-z]'),
  check (num_nonnulls(pix_key_type, pix_key, receiver_name, receiver_city) in (0, 4)),
  check (pix_key is null or case pix_key_type
    when 'cpf' then pix_key ~ '^[0-9]{11}$'
    when 'cnpj' then pix_key ~ '^[A-Z0-9]{12}[0-9]{2}$'
    when 'email' then pix_key ~ '^[^@]+@[^@]+\.[^@]+$' and lower(pix_key) not like '%.invalid'
    when 'phone' then pix_key ~ '^\+[1-9][0-9]{7,14}$'
    when 'random' then pix_key ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    else false end)
);
insert into public.store_settings default values;
insert into public.payment_settings default values;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_number bigint generated always as identity (start with 1001) unique,
  customer_id uuid references public.profiles(id) on delete restrict,
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 100),
  customer_phone text not null check (customer_phone ~ '^\+55[1-9]{2}[2-9][0-9]{7,8}$'),
  receipt_method public.receipt_method not null,
  delivery_area_id uuid references public.delivery_areas(id) on delete restrict,
  district text,
  street text check (char_length(btrim(street)) between 1 and 120),
  street_number text check (char_length(btrim(street_number)) between 1 and 20),
  complement text check (char_length(complement) <= 100),
  reference text check (char_length(reference) <= 160),
  notes text check (char_length(notes) <= 500),
  products_cents bigint not null check (products_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents between 0 and products_cents),
  delivery_fee_cents integer not null check (delivery_fee_cents between 0 and 9999999),
  total_cents bigint generated always as (products_cents - discount_cents + delivery_fee_cents) stored,
  status public.order_status not null,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (id, customer_id),
  unique (id, total_cents),
  check ((status in ('CONCLUIDO', 'CANCELADO')) = (finished_at is not null)),
  check ((receipt_method = 'delivery' and num_nonnulls(delivery_area_id, district, street, street_number) = 4)
      or (receipt_method = 'pickup' and num_nonnulls(delivery_area_id, district, street, street_number, complement, reference) = 0 and delivery_fee_cents = 0))
);
create index orders_customer_status_idx on public.orders (customer_id, status, created_at desc);
create index orders_area_idx on public.orders (delivery_area_id);
create index orders_status_idx on public.orders (status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  description text not null,
  size text,
  image_path text,
  quantity integer not null check (quantity between 1 and 99),
  unit_price_cents integer not null check (unit_price_cents between 0 and 9999999),
  is_reward boolean not null default false,
  earns_stamps boolean not null default false,
  subtotal_cents bigint generated always as (quantity::bigint * unit_price_cents) stored,
  check (not is_reward or (quantity = 1 and unit_price_cents = 0 and not earns_stamps)),
  unique (order_id, product_id, is_reward)
);
create unique index one_reward_item_per_order on public.order_items (order_id) where is_reward;
create index order_items_product_idx on public.order_items (product_id);
create index order_items_image_idx on public.order_items (image_path) where image_path is not null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique,
  method public.payment_method not null,
  status public.financial_status not null,
  amount_cents bigint not null check (amount_cents >= 0),
  pix_reference text unique check (pix_reference ~ '^[A-Za-z0-9]{1,25}$'),
  pix_payload text,
  pix_receiver jsonb,
  expires_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete restrict,
  refunded_at timestamptz,
  refunded_by uuid references auth.users(id) on delete restrict,
  refund_reason text check (char_length(btrim(refund_reason)) between 1 and 500),
  refund_reference text check (char_length(refund_reference) <= 150),
  foreign key (order_id, amount_cents) references public.orders (id, total_cents) on delete restrict,
  check ((amount_cents = 0 and status in ('ISENTO', 'CANCELADO')) or (amount_cents > 0 and status <> 'ISENTO')),
  check (((method = 'pix' and amount_cents > 0) and num_nonnulls(pix_reference, pix_payload, pix_receiver, expires_at) = 4)
      or ((method <> 'pix' or amount_cents = 0) and num_nonnulls(pix_reference, pix_payload, pix_receiver, expires_at) = 0)),
  check (status <> 'EXPIRADO' or method = 'pix'),
  check ((status in ('CONFIRMADO', 'REEMBOLSADO') and num_nonnulls(confirmed_at, confirmed_by) = 2)
      or (status not in ('CONFIRMADO', 'REEMBOLSADO') and num_nonnulls(confirmed_at, confirmed_by) = 0)),
  check ((status = 'REEMBOLSADO' and num_nonnulls(refunded_at, refunded_by, refund_reason) = 3)
      or (status <> 'REEMBOLSADO' and num_nonnulls(refunded_at, refunded_by, refund_reason, refund_reference) = 0)),
  check (refunded_at is null or refunded_at >= confirmed_at)
);
create index payments_expiration_idx on public.payments (expires_at) where status = 'PENDENTE' and expires_at is not null;
create index payments_financial_idx on public.payments (status, confirmed_at);

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  revision integer not null check (revision >= 0),
  operational_status public.order_status not null,
  financial_status public.financial_status not null,
  actor_id uuid references auth.users(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (order_id, revision)
);
create table public.loyalty_accounts (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  stamp_balance bigint not null default 0 check (stamp_balance < 9),
  created_at timestamptz not null default now()
);
create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.loyalty_accounts(profile_id) on delete restrict,
  state text not null default 'available' check (state in ('available', 'reserved', 'redeemed', 'revoked')),
  order_id uuid,
  created_at timestamptz not null default now(),
  foreign key (order_id, profile_id) references public.orders (id, customer_id) on delete restrict,
  check ((state in ('reserved', 'redeemed')) = (order_id is not null))
);
create unique index loyalty_reward_order_uidx on public.loyalty_rewards (order_id) where order_id is not null;
create index loyalty_rewards_profile_idx on public.loyalty_rewards (profile_id, state, created_at);
create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.loyalty_accounts(profile_id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  reward_id uuid references public.loyalty_rewards(id) on delete restrict,
  movement text not null check (movement in ('credit', 'refund', 'issue', 'revoke', 'reserve', 'release', 'redeem', 'restore')),
  delta integer not null,
  event_key text not null unique,
  created_at timestamptz not null default now(),
  check (case movement when 'credit' then delta > 0 when 'refund' then delta < 0
    when 'issue' then delta = -9 when 'revoke' then delta = 9 else delta = 0 end),
  check ((movement in ('credit', 'refund')) = (reward_id is null))
);
create index loyalty_transactions_profile_idx on public.loyalty_transactions (profile_id, created_at desc);
create index loyalty_transactions_order_idx on public.loyalty_transactions (order_id);

create table private.guest_order_tokens (
  order_id uuid primary key references public.orders(id) on delete restrict,
  token_hash bytea not null unique check (octet_length(token_hash) = 32)
);
create table private.token_signing_key (
  singleton boolean primary key default true check (singleton),
  secret bytea not null default extensions.gen_random_bytes(32) check (octet_length(secret) = 32)
);
insert into private.token_signing_key default values;
create table private.checkout_requests (
  scope text not null,
  request_id uuid not null,
  request_hash bytea not null check (octet_length(request_hash) = 32),
  order_id uuid unique references public.orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (scope, request_id)
);
create table private.order_actions (
  order_id uuid not null references public.orders(id) on delete restrict,
  request_id uuid not null,
  request_hash bytea not null,
  result jsonb not null,
  primary key (order_id, request_id)
);
