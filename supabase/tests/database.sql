begin;
set local plpgsql.check_asserts = on;
-- Exercise the future checkout flow inside this rolled-back test only.
grant execute on function public.place_order(uuid, public.receipt_method, public.payment_method, jsonb, jsonb, text) to anon, authenticated;

do $test$
declare
  customer_a uuid := '10000000-0000-4000-8000-000000000001';
  customer_b uuid := '10000000-0000-4000-8000-000000000002';
  admin_id uuid := '10000000-0000-4000-8000-000000000003';
  product uuid := 'a0000000-0000-4000-8000-000000000001';
  area uuid := 'd0000000-0000-4000-8000-000000000001';
  one_item jsonb := jsonb_build_array(jsonb_build_object('product_id', product, 'quantity', 1));
  contact jsonb := jsonb_build_object('name', 'Visitante QA', 'phone', '(11) 99000-0000',
    'delivery_area_id', area, 'street', 'Rua Teste', 'street_number', '15');
  guest_request uuid := gen_random_uuid();
  finish_request uuid := gen_random_uuid();
  reward_request uuid := gen_random_uuid();
  pix jsonb;
  receipt jsonb;
  reward jsonb;
  waiting jsonb;
  replacement jsonb;
  result jsonb;
  report jsonb;
  pix_id uuid;
  receipt_id uuid;
  reward_id uuid;
  waiting_id uuid;
  replacement_id uuid;
  product_original text;
  image_id uuid;
  guest_endpoint text := 'https://fcm.googleapis.com/fcm/send/fixture-guest';
  claim record;
begin
  insert into auth.users (id, email) values (customer_a, 'qa-a@example.test'), (customer_b, 'qa-b@example.test'), (admin_id, 'qa-admin@example.test');
  insert into public.admin_users (user_id) values (admin_id);

  assert (select not is_open from public.store_settings), 'the seed must start with a closed store';
  assert (select public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg','image/png','image/webp']
          from storage.buckets where id = 'product-images'), 'bucket settings';
  assert (select bool_and(relrowsecurity) and count(*) = 17 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname in
    ('profiles','addresses','admin_users','categories','products','delivery_areas','store_settings','payment_settings','orders',
     'order_items','payments','order_status_history','loyalty_accounts','loyalty_transactions','loyalty_rewards','push_subscriptions','notification_events'));
  begin
    update public.products set price_cents = -1 where id = product;
    raise exception 'negative price accepted';
  exception when check_violation then null; end;
  begin
    update public.products set category_id = gen_random_uuid() where id = product;
    raise exception 'missing category accepted';
  exception when foreign_key_violation then null; end;

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  assert (select count(*) = 4 from public.products), 'anonymous catalog includes published unavailable products';
  assert (select not is_open from public.store_settings);
  assert not has_table_privilege('public.profiles', 'select') and not has_table_privilege('public.orders', 'select')
    and not has_table_privilege('public.order_items', 'select') and not has_table_privilege('public.payments', 'select')
    and not has_table_privilege('public.payment_settings', 'select') and not has_table_privilege('public.admin_users', 'select')
    and not has_table_privilege('public.push_subscriptions', 'select') and not has_table_privilege('public.notification_events', 'select');
  assert not has_schema_privilege('private', 'usage') and not has_function_privilege('public.get_my_order(uuid)', 'execute');
  assert public.track_guest_order('BD-1001') is null;
  begin
    perform public.place_order(guest_request, 'pickup', 'receipt', contact, one_item);
    raise exception 'checkout accepted while closed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'store is closed' then raise; end if;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('product-images', 'anon.png');
    raise exception 'anonymous Storage write accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_a, 'user_metadata', jsonb_build_object('admin', true))::text, true);
  assert not public.is_admin();
  insert into public.profiles (name, phone) values ('Cliente A', '+5511990000000');
  insert into public.addresses (delivery_area_id, street, street_number) values (area, 'Rua A', '1');
  begin
    insert into public.admin_users (user_id) values (customer_a);
    raise exception 'privilege escalation allowed';
  exception when insufficient_privilege then null; end;
  update public.store_settings set is_open = true;
  assert not found;
  update public.products set price_cents = 1 where id = product;
  assert not found;
  assert (select count(*) = 0 from public.payment_settings);
  update public.payment_settings set pix_key = 'forbidden@example.test';
  assert not found;
  assert not has_table_privilege('public.push_subscriptions', 'insert')
    and not has_table_privilege('public.loyalty_rewards', 'update')
    and not has_table_privilege('public.orders', 'update');
  begin
    insert into storage.objects (bucket_id, name) values ('product-images', 'customer.png');
    raise exception 'customer Storage write accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_b)::text, true);
  insert into public.profiles (name, phone) values ('Cliente B', '+5511990000001');
  assert (select count(*) = 1 from public.profiles);
  assert (select count(*) = 0 from public.addresses);
  update public.profiles set name = 'forbidden' where id = customer_a;
  assert not found;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id)::text, true);
  assert public.is_admin();
  perform public.register_web_push('https://fcm.googleapis.com/fcm/send/fixture-admin',
    repeat('e',87), repeat('f',22), repeat('a',64), 'admin', '{}');
  update public.store_settings set is_open = true;
  assert found;
  update public.payment_settings set pix_key_type = 'email', pix_key = 'qa@example.test', receiver_name = 'QA BIJU', receiver_city = 'SAO PAULO';
  assert found;
  insert into storage.objects (bucket_id, name) values ('product-images', 'qa.png') returning id into image_id;
  update storage.objects set name = 'qa-v2.png' where id = image_id;
  assert found;
  update public.products set image_path = 'qa-v2.png' where id = product;
  delete from storage.objects where id = image_id;
  assert not found;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_b)::text, true);
  update storage.objects set name = 'forbidden.png' where id = image_id;
  assert not found;
  delete from storage.objects where id = image_id;
  assert not found;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id)::text, true);
  update public.products set image_path = null where id = product;
  delete from storage.objects where id = image_id;
  assert found;
  execute 'reset role';

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  assert (public.quote_order('delivery', area, one_item)->>'total_cents')::int = 1900;
  assert (public.quote_order('pickup', null, one_item)->>'delivery_fee_cents')::int = 0;
  begin
    perform public.place_order(gen_random_uuid(), 'delivery', 'pix', contact || '{"expected_total_cents":1800}', one_item);
    raise exception 'stale quote accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'checkout total changed' then raise; end if;
  end;
  pix := public.place_order(guest_request, 'delivery', 'pix', contact, one_item);
  pix_id := (pix->>'id')::uuid;
  assert pix->>'status' = 'AGUARDANDO_PAGAMENTO' and pix->>'financial_status' = 'PENDENTE';
  assert (pix->>'total_cents')::int = 1900 and pix->>'pix_payload' like '%540519.005802BR%';
  assert (pix->>'expires_at')::timestamptz - (pix->>'created_at')::timestamptz = interval '5 minutes';
  assert pix->>'tracking_token' ~ '^[0-9a-f]{64}$';
  assert public.place_order(guest_request, 'delivery', 'pix', contact, one_item) = pix;
  assert public.track_guest_order(pix->>'tracking_token')->>'id' = pix_id::text;
  assert not (public.track_guest_order(pix->>'tracking_token') ? 'customer_phone');
  assert public.track_guest_order(repeat('a',64)) is null;
  assert not has_function_privilege('public.claim_web_push()', 'execute');
  begin
    perform public.get_notification_feed(true, '-infinity', '{}');
    raise exception 'anonymous admin notification access allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.register_web_push(guest_endpoint, repeat('e',87), repeat('f',22), repeat('b',64), 'guest', array[repeat('a',64)]);
    raise exception 'invalid guest token subscribed';
  exception when insufficient_privilege then null; end;
  perform public.register_web_push(guest_endpoint, repeat('e',87), repeat('f',22), repeat('b',64), 'guest', array[pix->>'tracking_token']);
  begin
    perform public.place_order(guest_request, 'delivery', 'pix', contact, one_item, 'different');
    raise exception 'checkout replay with different payload allowed';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.place_order(gen_random_uuid(), 'pickup', 'receipt', contact,
      jsonb_build_array(jsonb_build_object('product_id', product, 'quantity', 0)));
    raise exception 'bad checkout quantity accepted';
  exception when invalid_parameter_value then null; end;
  execute 'reset role';
  assert (select token_hash = extensions.digest(convert_to(pix->>'tracking_token','UTF8'),'sha256')
    from private.guest_order_tokens where order_id = pix_id);
  assert (select right(private.pix_payload(1900, 'QA1001', s), 4) = '5736' from public.payment_settings s), 'BR Code CRC16 vector';
  begin
    update public.payments set amount_cents = 1901 where order_id = pix_id;
    raise exception 'payment amount differed from the order total';
  exception when foreign_key_violation then null; end;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_a)::text, true);
  receipt := public.place_order(gen_random_uuid(), 'pickup', 'receipt', '{}',
    jsonb_build_array(jsonb_build_object('product_id', product, 'quantity', 11)));
  receipt_id := (receipt->>'id')::uuid;
  assert receipt->>'status' = 'EM_PREPARO' and receipt->>'financial_status' = 'PENDENTE';
  assert receipt->>'number' <> pix->>'number' and receipt->>'tracking_token' is null;
  assert (select count(*) = 1 from public.orders);
  assert (select count(*) = 1 from public.order_items);
  assert (select count(*) = 0 from public.payments);
  assert (select stamp_balance = 0 from public.loyalty_accounts);
  assert public.get_my_order(pix_id) is null;
  begin
    perform public.admin_order_action(receipt_id, gen_random_uuid(), 'confirm');
    raise exception 'customer payment confirmation accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_b)::text, true);
  assert (select count(*) = 0 from public.orders);
  assert (select count(*) = 0 from public.order_items);
  assert (select count(*) = 0 from public.loyalty_accounts);
  assert public.get_my_order(receipt_id) is null;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id)::text, true);
  assert (select count(*) = 2 from public.payments);
  assert not has_table_privilege('public.payments', 'update');
  assert not has_table_privilege('public.orders', 'delete');
  perform public.admin_order_action(receipt_id, gen_random_uuid(), 'PRONTO');
  begin
    perform public.admin_order_action(receipt_id, gen_random_uuid(), 'CONCLUIDO');
    raise exception 'unpaid order completed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'invalid status transition or payment still pending' then raise; end if;
  end;
  result := public.admin_order_action(receipt_id, finish_request, 'confirm');
  assert result->>'financial_status' = 'CONFIRMADO';
  assert public.admin_order_action(receipt_id, finish_request, 'confirm') = result;
  perform public.admin_order_action(receipt_id, gen_random_uuid(), 'CONCLUIDO');
  report := public.admin_financial_summary(now() - interval '1 day', now() + interval '1 day');
  assert (report->>'received_cents')::int = 15400 and (report->>'pending_cents')::int = 1900;
  update public.payment_settings set receiver_name = 'QA ALTERADO';
  assert (select pix_receiver->>'name' = 'QA BIJU' and pix_payload = pix->>'pix_payload' from public.payments where order_id = pix_id);
  execute 'reset role';

  -- Move the clock boundary for this test order only, within the rolled-back fixture.
  update public.payments set expires_at = clock_timestamp() - interval '1 second' where order_id = pix_id;
  execute 'set local role service_role';
  assert public.expire_pix_orders() = 1;
  assert public.expire_pix_orders() = 0;
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id)::text, true);
  assert (select status = 'REVISAO_MANUAL' from public.orders where id = pix_id);
  assert public.admin_order_action(pix_id, gen_random_uuid(), 'confirm')->>'status' = 'EM_PREPARO';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_a)::text, true);
  assert (select stamp_balance = 2 from public.loyalty_accounts);
  assert (select count(*) = 1 from public.loyalty_rewards where state = 'available');
  assert (public.quote_order('pickup', null, one_item)->>'discount_cents')::int = 1400;
  assert (public.quote_order('delivery', area, one_item)->>'total_cents')::int = 500;
  reward := public.place_order(reward_request, 'pickup', 'pix', '{}', one_item);
  reward_id := (reward->>'id')::uuid;
  assert reward->>'financial_status' = 'ISENTO' and (reward->>'total_cents')::int = 0 and reward->>'pix_payload' is null;
  assert public.place_order(reward_request, 'pickup', 'pix', '{}', one_item) = reward;
  assert (public.place_order(gen_random_uuid(), 'pickup', 'receipt', '{}', one_item)->>'total_cents')::int = 1400;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id)::text, true);
  assert public.admin_order_action(reward_id, gen_random_uuid(), 'CANCELADO', 'Cancelamento de teste')->>'status' = 'CANCELADO';
  assert (select exists(select 1 from public.order_status_history where order_id = reward_id and reason = 'CANCELADO: Cancelamento de teste'));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_a)::text, true);
  waiting := public.place_order(gen_random_uuid(), 'delivery', 'pix', contact, one_item);
  waiting_id := (waiting->>'id')::uuid;
  assert (waiting->>'total_cents')::int = 500 and waiting->>'status' = 'AGUARDANDO_PAGAMENTO', 'reward keeps shipping fee';
  execute 'reset role';
  update public.payments set expires_at = clock_timestamp() - interval '1 second' where order_id = waiting_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_a)::text, true);
  assert public.get_my_order(waiting_id)->>'status' = 'REVISAO_MANUAL';
  assert (select count(*) = 1 from public.loyalty_rewards where state = 'available');
  replacement := public.place_order(gen_random_uuid(), 'pickup', 'receipt', '{}', one_item);
  replacement_id := (replacement->>'id')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id)::text, true);
  begin
    perform public.admin_order_action(waiting_id, gen_random_uuid(), 'confirm');
    raise exception 'late Pix confirmation used the same reward twice';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'late Pix confirmation requires an available reward' then raise; end if;
  end;
  perform public.admin_order_action(replacement_id, gen_random_uuid(), 'PRONTO');
  perform public.admin_order_action(replacement_id, gen_random_uuid(), 'CONCLUIDO');
  perform public.admin_order_action(receipt_id, gen_random_uuid(), 'refund', 'Reembolso integral QA');
  report := public.admin_financial_summary(now() - interval '1 day', now() + interval '1 day');
  assert (report->>'refunded_cents')::int = 15400 and (report->>'canceled_orders')::int = 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_a)::text, true);
  assert (select stamp_balance = -9 from public.loyalty_accounts), 'used reward is reflected by the compensatory balance';
  assert (select count(*) = 1 from public.loyalty_rewards where state = 'redeemed');
  execute 'reset role';

  select product_name into product_original from public.order_items where order_id = receipt_id;
  update public.products set name = 'Produto alterado', price_cents = 2000 where id = product;
  update public.profiles set name = 'Perfil alterado' where id = customer_a;
  assert (select product_name = product_original and unit_price_cents = 1400 from public.order_items where order_id = receipt_id);
  assert (select customer_name = 'Cliente A' from public.orders where id = receipt_id);
  assert (select count(*) from public.notification_events) =
    (select count(*) from public.order_status_history) + (select count(*) from public.loyalty_rewards);
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  assert not exists (select 1 from public.get_notification_feed(false, '-infinity', array[repeat('a',64)]));
  assert exists (select 1 from public.get_notification_feed(false, '-infinity', array[pix->>'tracking_token'])
    where order_id = pix_id and kind = 'expired');
  begin
    perform public.revoke_web_push(guest_endpoint, repeat('a',64));
    raise exception 'revocation with an invalid device secret allowed';
  exception when insufficient_privilege then null; end;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_b)::text, true);
  assert not exists (select 1 from public.get_notification_feed(false, '-infinity', '{}') where order_id = receipt_id);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer_a)::text, true);
  assert exists (select 1 from public.get_notification_feed(false, '-infinity', '{}') where order_id = receipt_id and kind = 'paid');
  assert exists (select 1 from public.get_notification_feed(false, '-infinity', '{}') where kind = 'reward');
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id)::text, true);
  assert exists (select 1 from public.get_notification_feed(true, '-infinity', '{}') where order_id = pix_id and kind = 'manual_review');
  perform public.acknowledge_web_push('https://fcm.googleapis.com/fcm/send/fixture-admin', repeat('a',64), true,
    array(select id from public.get_notification_feed(true, '-infinity', '{}') where order_id = pix_id and kind = 'new_order'));
  execute 'reset role';
  assert exists (select 1 from private.notification_deliveries d
    join private.notification_payloads n on n.id = d.event_id
    where n.order_id = pix_id and n.admin_kind = 'new_order' and d.state = 'sent');
  execute 'set local role service_role';
  select * into strict claim from public.claim_web_push() where endpoint = guest_endpoint and kind = 'expired';
  assert not exists (select 1 from public.claim_web_push() where event_id = claim.event_id and subscription_id = claim.subscription_id);
  perform public.finish_web_push(claim.event_id, claim.subscription_id, claim.lease, 'expired');
  execute 'reset role';
  assert (select revoked_at is not null from public.push_subscriptions where endpoint = guest_endpoint);
  begin
    update public.order_items set quantity = 100 where order_id = receipt_id;
    raise exception 'invalid persisted quantity accepted';
  exception when check_violation then null; end;
  begin
    delete from public.orders where id = receipt_id;
    raise exception 'financial records could have been orphaned';
  exception when foreign_key_violation or sqlstate '23001' then null; end;
  begin
    delete from public.payments where order_id = receipt_id;
    raise exception 'payment history could have been deleted';
  exception when sqlstate '23001' then null; end;
end;
$test$;

rollback;
