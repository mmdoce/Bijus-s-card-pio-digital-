begin;
set local plpgsql.check_asserts = on;

do $settings$
declare
  admin uuid := '30000000-0000-4000-8000-000000000001';
  customer uuid := '30000000-0000-4000-8000-000000000002';
  area uuid;
begin
  insert into auth.users (id, email) values (admin, 'settings-admin@example.test'), (customer, 'settings-client@example.test');
  insert into public.admin_users values (admin);
  assert (select not is_open from public.store_settings);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin)::text, true);
  insert into public.delivery_areas (name, fee_cents) values ('Bairro do teste SQL', 300) returning id into area;
  update public.delivery_areas set fee_cents = 600 where id = area;
  assert (select fee_cents = 600 from public.delivery_areas where id = area);
  update public.payment_settings set pix_key_type = 'email', pix_key = 'settings@example.test', receiver_name = 'TESTE SQL', receiver_city = 'SAO PAULO';
  assert (select pix_key_type = 'email' from public.payment_settings);
  assert public.set_store_open(true);
  assert (select is_open from public.store_settings);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer)::text, true);
  assert (select count(*) = 0 from public.payment_settings);
  update public.payment_settings set receiver_name = 'NAO AUTORIZADO';
  assert not found;
  update public.delivery_areas set fee_cents = 1 where id = area;
  assert not found;
  begin
    perform public.set_store_open(false);
    raise exception 'customer changed store state';
  exception when insufficient_privilege then null; end;
  assert has_function_privilege('public.place_order(uuid,public.receipt_method,public.payment_method,jsonb,jsonb,text)', 'EXECUTE')
    = (to_regprocedure('public.quote_order(public.receipt_method,uuid,jsonb)') is not null);
  execute 'reset role';

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  assert (select is_open from public.store_settings);
  assert not has_table_privilege('public.payment_settings','SELECT');
  assert not has_function_privilege('public.set_store_open(boolean)','EXECUTE');
  assert has_function_privilege('public.place_order(uuid,public.receipt_method,public.payment_method,jsonb,jsonb,text)', 'EXECUTE')
    = (to_regprocedure('public.quote_order(public.receipt_method,uuid,jsonb)') is not null);
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin)::text, true);
  update public.delivery_areas set available = false where id = area;
  begin
    perform public.quote_order('delivery', area, jsonb_build_array(jsonb_build_object('product_id', gen_random_uuid(), 'quantity', 1)));
    raise exception 'inactive delivery area accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'delivery area is unavailable' then raise; end if;
  end;
  assert not public.set_store_open(false);
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  assert (select count(*) = 0 from public.delivery_areas where id = area);
  assert (select not is_open from public.store_settings);
  execute 'reset role';
end;
$settings$;

rollback;
