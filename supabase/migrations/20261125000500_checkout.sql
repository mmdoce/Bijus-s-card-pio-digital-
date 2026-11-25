create function public.place_order(
  p_request_id uuid, p_receipt_method public.receipt_method, p_payment_method public.payment_method,
  p_customer jsonb, p_items jsonb, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  request_scope text := coalesce(auth.uid()::text, 'guest');
  payload_hash bytea;
  request_row private.checkout_requests;
  profile_row public.profiles;
  store_row public.store_settings;
  area_row public.delivery_areas;
  receiver public.payment_settings;
  product_row public.products;
  order_row public.orders;
  line record;
  item jsonb;
  snapshots jsonb := '[]'::jsonb;
  products_total bigint := 0;
  discount bigint := 0;
  delivery_fee integer := 0;
  reward_product uuid;
  previous_product uuid;
  new_id uuid := gen_random_uuid();
  full_name text;
  phone text;
  area_id uuid;
  guest_token text;
  pix_ref text;
  is_pix boolean;
  created timestamptz;
  paid_quantity integer;
begin
  if p_request_id is null or p_request_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_receipt_method is null or p_payment_method is null
    or jsonb_typeof(p_customer) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid checkout' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 or octet_length(p_items::text) > 20000
    or octet_length(p_customer::text) > 4000 or char_length(p_notes) > 500 then
    raise exception 'invalid checkout size' using errcode = '22023';
  end if;
  payload_hash := extensions.digest(convert_to(jsonb_build_array(p_receipt_method, p_payment_method, p_customer, p_items, p_notes)::text, 'UTF8'), 'sha256');
  insert into private.checkout_requests (scope, request_id, request_hash) values (request_scope, p_request_id, payload_hash)
  on conflict (scope, request_id) do nothing;
  select * into strict request_row from private.checkout_requests
  where scope = request_scope and request_id = p_request_id for update;
  if request_row.request_hash <> payload_hash then
    raise exception 'checkout request id already used for different data' using errcode = '22023';
  end if;
  if request_row.order_id is not null then
    perform private.expire_order(request_row.order_id);
    guest_token := case when uid is null then private.guest_token(request_row.order_id, p_request_id) end;
    return private.order_projection(request_row.order_id) || jsonb_build_object('tracking_token', guest_token);
  end if;

  select * into strict store_row from public.store_settings for share;
  if not store_row.is_open then raise exception 'store is closed' using errcode = 'P0001'; end if;
  if uid is not null then
    select * into profile_row from public.profiles where id = uid;
    if not found then raise exception 'customer profile is required' using errcode = '22023'; end if;
    perform private.lock_loyalty(uid);
  end if;
  full_name := coalesce(nullif(btrim(p_customer->>'name'), ''), profile_row.name);
  phone := regexp_replace(coalesce(nullif(btrim(p_customer->>'phone'), ''), profile_row.phone, ''), '[() .+-]', '', 'g');
  if length(phone) in (10, 11) then phone := '55' || phone; end if;
  phone := '+' || phone;
  if full_name is null or char_length(full_name) > 100 or phone !~ '^\+55[1-9]{2}[2-9][0-9]{7,8}$' then
    raise exception 'invalid customer name or phone' using errcode = '22023';
  end if;

  if p_receipt_method = 'delivery' then
    area_id := (p_customer->>'delivery_area_id')::uuid;
    select * into area_row from public.delivery_areas where id = area_id and available for share;
    if not found then raise exception 'delivery area is unavailable' using errcode = '22023'; end if;
    delivery_fee := area_row.fee_cents;
  end if;

  for line in select * from jsonb_to_recordset(p_items) as input(product_id uuid, quantity integer) order by product_id loop
    if line.product_id is null or line.quantity is null or line.quantity not between 1 and 99 or line.product_id = previous_product then
      raise exception 'invalid or repeated product' using errcode = '22023';
    end if;
    previous_product := line.product_id;
    select p.* into product_row from public.products p join public.categories c on c.id = p.category_id
    where p.id = line.product_id and p.available and p.published and c.available for share of p, c;
    if not found then raise exception 'product is unavailable' using errcode = '22023'; end if;

    if product_row.id = store_row.reward_product_id and uid is not null
      and exists (select 1 from public.loyalty_rewards r where r.profile_id = uid and r.state = 'available') then
      reward_product := product_row.id;
      discount := product_row.price_cents;
    end if;
    products_total := products_total + product_row.price_cents::bigint * line.quantity;
    snapshots := snapshots || jsonb_build_array(to_jsonb(product_row) || jsonb_build_object('quantity', line.quantity));
  end loop;

  is_pix := p_payment_method = 'pix' and products_total - discount + delivery_fee > 0;
  created := clock_timestamp();
  insert into public.orders (
    id, customer_id, customer_name, customer_phone, receipt_method, delivery_area_id, district,
    street, street_number, complement, reference, notes, products_cents, discount_cents, delivery_fee_cents, status, created_at
  )
  values (
    new_id, uid, full_name, phone, p_receipt_method, area_row.id, area_row.name,
    case when area_id is not null then btrim(p_customer->>'street') end,
    case when area_id is not null then btrim(p_customer->>'street_number') end,
    case when area_id is not null then nullif(btrim(p_customer->>'complement'), '') end,
    case when area_id is not null then nullif(btrim(p_customer->>'reference'), '') end,
    nullif(btrim(p_notes), ''), products_total, discount, delivery_fee,
    case when is_pix then 'AGUARDANDO_PAGAMENTO'::public.order_status else 'EM_PREPARO'::public.order_status end, created
  ) returning * into order_row;

  for item in select value from jsonb_array_elements(snapshots) loop
    paid_quantity := (item->>'quantity')::integer;
    if (item->>'id')::uuid = reward_product then
      insert into public.order_items (order_id, product_id, product_name, description, size, image_path, quantity, unit_price_cents, is_reward)
      values (new_id, reward_product, item->>'name', item->>'description', item->>'size', item->>'image_path', 1, 0, true);
      paid_quantity := paid_quantity - 1;
    end if;
    if paid_quantity > 0 then
      insert into public.order_items (order_id, product_id, product_name, description, size, image_path, quantity, unit_price_cents, earns_stamps)
      values (new_id, (item->>'id')::uuid, item->>'name', item->>'description', item->>'size', item->>'image_path',
        paid_quantity, (item->>'price_cents')::integer, (item->>'earns_stamps')::boolean);
    end if;
  end loop;

  if reward_product is not null then
    if not private.reward_movement(order_row, 'reserve') then
      raise exception 'reward is not available' using errcode = 'P0001';
    end if;
  end if;
  if is_pix then
    select * into strict receiver from public.payment_settings for share;
    if receiver.pix_key is null then raise exception 'Pix is not configured' using errcode = 'P0001'; end if;
    pix_ref := left(replace(new_id::text, '-', ''), 25);
    insert into public.payments (order_id, method, status, amount_cents, pix_reference, pix_payload, pix_receiver, expires_at)
    values (new_id, 'pix', 'PENDENTE', order_row.total_cents, pix_ref, private.pix_payload(order_row.total_cents, pix_ref, receiver),
      jsonb_build_object('type', receiver.pix_key_type, 'key', receiver.pix_key, 'name', receiver.receiver_name, 'city', receiver.receiver_city),
      created + interval '5 minutes');
  else
    insert into public.payments (order_id, method, status, amount_cents)
    values (new_id, p_payment_method, case when order_row.total_cents = 0 then 'ISENTO'::public.financial_status else 'PENDENTE'::public.financial_status end,
      order_row.total_cents);
  end if;

  if uid is null then
    guest_token := private.guest_token(new_id, p_request_id);
    insert into private.guest_order_tokens (order_id, token_hash)
    values (new_id, extensions.digest(convert_to(guest_token, 'UTF8'), 'sha256'));
  end if;
  update private.checkout_requests set order_id = new_id where scope = request_scope and request_id = p_request_id;
  perform private.record_order_event(new_id, uid, 'order_created');
  return private.order_projection(new_id) || jsonb_build_object('tracking_token', guest_token);
end;
$$;

create function public.track_guest_order(p_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  order_id uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select t.order_id into order_id from private.guest_order_tokens t
    where t.token_hash = extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
  perform private.expire_order(order_id);
  return private.order_projection(order_id);
end;
$$;

create function public.get_my_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.customer_id = auth.uid()) then return null; end if;
  perform private.expire_order(p_order_id);
  return private.order_projection(p_order_id);
end;
$$;

revoke all on function public.place_order(uuid, public.receipt_method, public.payment_method, jsonb, jsonb, text),
  public.track_guest_order(text), public.get_my_order(uuid) from public, anon, authenticated, service_role;
grant execute on function public.place_order(uuid, public.receipt_method, public.payment_method, jsonb, jsonb, text),
  public.track_guest_order(text) to anon, authenticated;
grant execute on function public.get_my_order(uuid) to authenticated;
