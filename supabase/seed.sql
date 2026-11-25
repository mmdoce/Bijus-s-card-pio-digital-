-- Fixtures only for the local stack. The CLI loads this file during a local reset.
insert into public.categories (id, name, display_order) values
  ('c0000000-0000-4000-8000-000000000001', 'Açaís', 1),
  ('c0000000-0000-4000-8000-000000000002', 'Doces', 2);

insert into public.products (id, category_id, name, description, price_cents, size, earns_stamps, available) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Açaí 300 ml', 'Açaí cremoso na garrafa.', 1400, '300 ml', true, true),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Açaí 500 ml', 'Porção maior de açaí cremoso.', 2100, '500 ml', true, true),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'Brownie de chocolate', 'Casquinha fina e interior macio.', 900, null, false, true),
  ('a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002', 'Brigadeiro de colher', 'Brigadeiro cremoso com granulado.', 800, null, false, false);

insert into public.delivery_areas (id, name, fee_cents) values
  ('d0000000-0000-4000-8000-000000000001', 'Centro', 500),
  ('d0000000-0000-4000-8000-000000000002', 'Jardim das Flores', 750);

update public.store_settings set is_open = false, reward_product_id = 'a0000000-0000-4000-8000-000000000001';
