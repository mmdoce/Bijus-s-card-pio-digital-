create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.admin_users enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.delivery_areas enable row level security;
alter table public.store_settings enable row level security;
alter table public.payment_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.order_status_history enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_events enable row level security;
alter table private.guest_order_tokens enable row level security;
alter table private.token_signing_key enable row level security;
alter table private.checkout_requests enable row level security;
alter table private.order_actions enable row level security;
alter table private.notification_deliveries enable row level security;

revoke all on table public.profiles, public.addresses, public.admin_users, public.categories, public.products,
  public.delivery_areas, public.store_settings, public.payment_settings, public.orders, public.order_items,
  public.payments, public.order_status_history, public.loyalty_accounts, public.loyalty_transactions,
  public.loyalty_rewards, public.push_subscriptions, public.notification_events
from public, anon, authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated, service_role;
revoke all on sequence public.orders_public_number_seq from public, anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.categories, public.products, public.delivery_areas, public.store_settings to anon, authenticated;
grant select on public.profiles, public.addresses, public.orders, public.order_items, public.payments, public.order_status_history,
  public.payment_settings, public.loyalty_accounts, public.loyalty_transactions, public.loyalty_rewards to authenticated;
grant insert (name, phone), update (name, phone) on public.profiles to authenticated;
grant insert (delivery_area_id, street, street_number, complement, reference),
  update (delivery_area_id, street, street_number, complement, reference), delete on public.addresses to authenticated;
grant insert (name, available, display_order), update (name, available, display_order) on public.categories to authenticated;
grant insert (category_id, name, description, price_cents, image_path, size, published, available, earns_stamps),
  update (category_id, name, description, price_cents, image_path, size, published, available, earns_stamps) on public.products to authenticated;
grant insert (name, fee_cents, available), update (name, fee_cents, available) on public.delivery_areas to authenticated;
grant update (is_open, contact_phone, reward_product_id) on public.store_settings to authenticated;
grant update (pix_key_type, pix_key, receiver_name, receiver_city) on public.payment_settings to authenticated;

create policy profile_read_own on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profile_insert_own on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profile_update_own on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy addresses_own on public.addresses for all to authenticated using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy categories_public on public.categories for select to anon, authenticated using (available);
create policy products_public on public.products for select to anon, authenticated
  using (published and exists (select 1 from public.categories c where c.id = products.category_id and c.available));
create policy areas_public on public.delivery_areas for select to anon, authenticated using (available);
create policy store_public on public.store_settings for select to anon, authenticated using (true);

create policy categories_admin on public.categories for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy products_admin on public.products for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy areas_admin on public.delivery_areas for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy store_admin on public.store_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy payment_settings_admin_read on public.payment_settings for select to authenticated using ((select public.is_admin()));
create policy payment_settings_admin_update on public.payment_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy orders_owner_or_admin on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or (select public.is_admin()));
create policy items_owner_or_admin on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy payment_admin_read on public.payments for select to authenticated using ((select public.is_admin()));
create policy history_admin_read on public.order_status_history for select to authenticated using ((select public.is_admin()));
create policy loyalty_account_owner on public.loyalty_accounts for select to authenticated using (profile_id = (select auth.uid()));
create policy loyalty_movements_owner on public.loyalty_transactions for select to authenticated using (profile_id = (select auth.uid()));
create policy loyalty_rewards_owner on public.loyalty_rewards for select to authenticated using (profile_id = (select auth.uid()));

create function private.touch_store_settings()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger store_settings_touch before update on public.store_settings for each row execute function private.touch_store_settings();
revoke all on function private.touch_store_settings() from public, anon, authenticated, service_role;

create function private.prevent_financial_history_delete()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'financial history cannot be deleted' using errcode = '23001';
end;
$$;
create trigger retain_payments before delete on public.payments for each row execute function private.prevent_financial_history_delete();
create trigger retain_order_history before delete on public.order_status_history for each row execute function private.prevent_financial_history_delete();
create trigger retain_loyalty_history before delete on public.loyalty_transactions for each row execute function private.prevent_financial_history_delete();
revoke all on function private.prevent_financial_history_delete() from public, anon, authenticated, service_role;
