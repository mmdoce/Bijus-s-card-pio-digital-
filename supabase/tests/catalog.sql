begin;
set local plpgsql.check_asserts = on;
-- A rollback-only fixture order is needed to exercise image history protection.
grant execute on function public.place_order(uuid, public.receipt_method, public.payment_method, jsonb, jsonb, text) to anon, authenticated;

do $catalog$
declare
  admin uuid := '20000000-0000-4000-8000-000000000001';
  customer uuid := '20000000-0000-4000-8000-000000000002';
  category uuid;
  unused_category uuid;
  product uuid;
  test_order uuid;
begin
  insert into auth.users (id, email) values (admin, 'catalog-admin@example.test'), (customer, 'catalog-client@example.test');
  insert into public.admin_users (user_id) values (admin);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin)::text, true);
  insert into public.categories (name, display_order) values ('Categoria do teste SQL', 42) returning id into category;
  insert into public.categories (name) values ('Categoria sem vínculos SQL') returning id into unused_category;
  insert into public.products (category_id, name, description, price_cents, size, image_path, earns_stamps)
  values (category, 'Garrafa SQL', 'Descrição SQL', 1490, '300 ml', 'products/primeira.png', true) returning id into product;
  insert into storage.objects (bucket_id, name) values ('product-images','products/primeira.png'), ('product-images','products/segunda.png');
  update public.store_settings set is_open = true, reward_product_id = product;
  begin
    delete from public.categories where id = category;
    raise exception 'category with a product was deleted';
  exception when foreign_key_violation or sqlstate '23001' then null; end;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer)::text, true);
  delete from public.categories where id = unused_category;
  assert not found, 'customer cannot delete a category despite the role grant';
  update public.products set price_cents = 1 where id = product;
  assert not found, 'customer cannot change prices';
  begin
    insert into public.categories (name) values ('Escrita negada');
    raise exception 'customer inserted an administrative record';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('product-images', 'products/negado.png');
    raise exception 'customer uploaded an administrative image';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  assert (select count(*) = 1 from public.products where id = product);
  assert not has_table_privilege('public.categories', 'DELETE');
  select (public.place_order(gen_random_uuid(), 'pickup', 'receipt', '{"name":"Visitante SQL","phone":"+5511990000000"}',
    jsonb_build_array(jsonb_build_object('product_id', product, 'quantity', 1)))->>'id')::uuid into test_order;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin)::text, true);
  update public.products set image_path = 'products/segunda.png', name = 'Garrafa editada', price_cents = 1590, available = false where id = product;
  delete from storage.objects where name = 'products/primeira.png';
  assert not found, 'the previous image remains attached to the order';
  delete from storage.objects where name = 'products/segunda.png';
  assert not found, 'the current image is still attached to the product';
  assert (select image_path = 'products/primeira.png' and unit_price_cents = 1490 from public.order_items i where i.order_id = test_order);
  update public.categories set available = false, name = 'Categoria desativada SQL' where id = category;
  delete from public.categories where id = unused_category;
  assert found, 'admin can delete a category without products';
  assert not has_table_privilege('public.products', 'DELETE');
  execute 'reset role';

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  assert (select count(*) = 0 from public.categories where id = category);
  assert (select count(*) = 0 from public.products where id = product);
  begin
    perform public.quote_order('pickup', null, jsonb_build_array(jsonb_build_object('product_id', product, 'quantity', 1)));
    raise exception 'unavailable product accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'product is unavailable' then raise; end if;
  end;
  execute 'reset role';
end;
$catalog$;

rollback;
