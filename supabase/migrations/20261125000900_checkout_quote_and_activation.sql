-- Shared valuation. Only order placement acquires the loyalty account lock before valuation.
create function private.checkout_valuation(p_user uuid, p_receipt_method public.receipt_method, p_area_id uuid, p_items jsonb)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  store_row public.store_settings;
  area_row public.delivery_areas;
  product_row public.products;
  line record;
  snapshots jsonb := '[]'::jsonb;
  products_total bigint := 0;
  discount bigint := 0;
  delivery_fee integer := 0;
  reward_product uuid;
  previous_product uuid;
  area_id uuid;
begin
  if p_receipt_method is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'invalid checkout' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) not between 1 and 50 or octet_length(p_items::text) > 20000 then
    raise exception 'invalid checkout size' using errcode = '22023';
  end if;
  select * into strict store_row from public.store_settings for share;
  if not store_row.is_open then raise exception 'store is closed' using errcode = 'P0001'; end if;
  if p_receipt_method = 'delivery' then
    area_id := p_area_id;
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

    if product_row.id = store_row.reward_product_id and p_user is not null
      and exists (select 1 from public.loyalty_rewards r where r.profile_id = p_user and r.state = 'available') then
      reward_product := product_row.id;
      discount := product_row.price_cents;
    end if;
    products_total := products_total + product_row.price_cents::bigint * line.quantity;
    snapshots := snapshots || jsonb_build_array(to_jsonb(product_row) || jsonb_build_object('quantity', line.quantity));
  end loop;

  return jsonb_build_object(
    'products_cents', products_total, 'discount_cents', discount, 'delivery_fee_cents', delivery_fee,
    'total_cents', products_total - discount + delivery_fee, 'reward_product', reward_product,
    'area_name', area_row.name, 'items', snapshots
  );
end;
$$;
revoke all on function private.checkout_valuation(uuid, public.receipt_method, uuid, jsonb) from public, anon, authenticated, service_role;

create function public.quote_order(p_receipt_method public.receipt_method, p_area_id uuid, p_items jsonb)
returns jsonb language sql security definer set search_path = ''
as $$
  select (private.checkout_valuation(auth.uid(),p_receipt_method,p_area_id,p_items)
    - 'items' - 'reward_product' - 'area_name')
    || jsonb_build_object('pix_available', exists(select 1 from public.payment_settings where pix_key is not null));
$$;
revoke all on function public.quote_order(public.receipt_method, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.quote_order(public.receipt_method, uuid, jsonb) to anon, authenticated;

create or replace function public.place_order(
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
  quote jsonb;
  receiver public.payment_settings;
  order_row public.orders;
  item jsonb;
  snapshots jsonb := '[]'::jsonb;
  products_total bigint := 0;
  discount bigint := 0;
  delivery_fee integer := 0;
  reward_product uuid;
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

  if p_receipt_method = 'delivery' then area_id := (p_customer->>'delivery_area_id')::uuid; end if;
  quote := private.checkout_valuation(uid, p_receipt_method, area_id, p_items);
  products_total := (quote->>'products_cents')::bigint;
  discount := (quote->>'discount_cents')::bigint;
  delivery_fee := (quote->>'delivery_fee_cents')::integer;
  reward_product := (quote->>'reward_product')::uuid;
  snapshots := quote->'items';
  if p_customer ? 'expected_total_cents' and p_customer->>'expected_total_cents' is distinct from quote->>'total_cents' then
    raise exception 'checkout total changed' using errcode = '22023';
  end if;

  is_pix := p_payment_method = 'pix' and products_total - discount + delivery_fee > 0;
  created := clock_timestamp();
  insert into public.orders (
    id, customer_id, customer_name, customer_phone, receipt_method, delivery_area_id, district,
    street, street_number, complement, reference, notes, products_cents, discount_cents, delivery_fee_cents, status, created_at
  )
  values (
    new_id, uid, full_name, phone, p_receipt_method, area_id, quote->>'area_name',
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

create or replace function public.admin_order_action(
  p_order_id uuid, p_request_id uuid, p_action text, p_reason text default null, p_reference text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  order_row public.orders;
  payment_row public.payments;
  previous private.order_actions;
  payload_hash bytea;
  result jsonb;
  next_status public.order_status;
  occurred timestamptz;
  expired boolean;
  reward_item boolean;
begin
  if uid is null or not public.is_admin() then raise exception 'administrator required' using errcode = '42501'; end if;
  if p_request_id is null or p_action is null or char_length(p_action) > 30
    or char_length(p_reason) > 500 or char_length(p_reference) > 150 then
    raise exception 'invalid order action' using errcode = '22023';
  end if;
  payload_hash := extensions.digest(convert_to(jsonb_build_array(p_action, p_reason, p_reference)::text, 'UTF8'), 'sha256');

  select * into order_row from public.orders where id = p_order_id for update;
  if not found then raise exception 'order not found' using errcode = '22023'; end if;
  select * into previous from private.order_actions where order_id = p_order_id and request_id = p_request_id;
  if found then
    if previous.request_hash <> payload_hash then raise exception 'order action id already used for different data' using errcode = '22023'; end if;
    return previous.result;
  end if;

  expired := private.expire_order(p_order_id);
  select * into strict order_row from public.orders where id = p_order_id;
  select * into strict payment_row from public.payments where order_id = p_order_id;
  select exists (select 1 from public.order_items where order_id = p_order_id and is_reward) into reward_item;
  occurred := clock_timestamp();
  next_status := order_row.status;
  if p_action = 'expire' then
    if not expired and order_row.status <> 'REVISAO_MANUAL' then raise exception 'Pix has not expired' using errcode = 'P0001'; end if;
  elsif p_action = 'confirm' then
    if payment_row.status not in ('PENDENTE', 'EXPIRADO') or not (
      (payment_row.method = 'pix' and order_row.status in ('AGUARDANDO_PAGAMENTO', 'REVISAO_MANUAL'))
      or (payment_row.method = 'receipt' and order_row.status in ('EM_PREPARO', 'PRONTO', 'PRONTO_ENTREGA', 'SAIU_PARA_ENTREGA'))
    ) then raise exception 'payment cannot be confirmed' using errcode = 'P0001'; end if;
    if payment_row.method = 'pix' then next_status := 'EM_PREPARO'; end if;
    update public.payments set status = 'CONFIRMADO', confirmed_at = occurred, confirmed_by = uid where order_id = p_order_id;
  elsif p_action = 'refund' then
    if payment_row.status <> 'CONFIRMADO' or nullif(btrim(p_reason), '') is null then
      raise exception 'confirmed payment and refund reason required' using errcode = 'P0001';
    end if;
    update public.payments set status = 'REEMBOLSADO', refunded_at = occurred, refunded_by = uid,
      refund_reason = btrim(p_reason), refund_reference = nullif(btrim(p_reference), '') where order_id = p_order_id;
  else
    if p_action = 'CANCELADO' and nullif(btrim(p_reason), '') is null then
      raise exception 'cancellation reason required' using errcode = '22023';
    end if;
    if p_action = 'CANCELADO' and order_row.status not in ('CANCELADO', 'CONCLUIDO') and payment_row.status <> 'CONFIRMADO' then
      next_status := 'CANCELADO';
      update public.payments set status = 'CANCELADO' where order_id = p_order_id and status <> 'REEMBOLSADO';
    elsif order_row.status = 'EM_PREPARO' and p_action = 'PRONTO' and order_row.receipt_method = 'pickup' then
      next_status := 'PRONTO';
    elsif order_row.status = 'EM_PREPARO' and p_action = 'PRONTO_ENTREGA' and order_row.receipt_method = 'delivery' then
      next_status := 'PRONTO_ENTREGA';
    elsif order_row.status in ('EM_PREPARO', 'PRONTO_ENTREGA') and p_action = 'SAIU_PARA_ENTREGA' and order_row.receipt_method = 'delivery' then
      next_status := 'SAIU_PARA_ENTREGA';
    elsif order_row.status in ('PRONTO', 'SAIU_PARA_ENTREGA') and p_action = 'CONCLUIDO' and payment_row.status in ('CONFIRMADO', 'ISENTO') then
      next_status := 'CONCLUIDO';
    else
      raise exception 'invalid status transition or payment still pending' using errcode = 'P0001';
    end if;
  end if;

  if p_action <> 'expire' then
    update public.orders set status = next_status, revision = revision + 1,
      finished_at = case when next_status in ('CONCLUIDO', 'CANCELADO') then coalesce(finished_at, occurred) end
    where id = p_order_id returning * into order_row;

    if p_action = 'confirm' then
      if reward_item then
        if payment_row.status = 'EXPIRADO' then
          if not private.reward_movement(order_row, 'reserve') then
            raise exception 'late Pix confirmation requires an available reward' using errcode = 'P0001';
          end if;
        end if;
        if not private.reward_movement(order_row, 'redeem') then raise exception 'reward reservation missing' using errcode = 'P0001'; end if;
      end if;
      perform private.apply_stamps(order_row, false);
    elsif p_action = 'refund' then
      perform private.reward_movement(order_row, 'restore');
      perform private.apply_stamps(order_row, true);
    elsif p_action = 'CANCELADO' then
      perform private.reward_movement(order_row, 'release');
    elsif p_action = 'CONCLUIDO' and payment_row.status = 'ISENTO' and reward_item then
      if not private.reward_movement(order_row, 'redeem') then raise exception 'reward reservation missing' using errcode = 'P0001'; end if;
    end if;
    perform private.record_order_event(p_order_id, uid,
      case when p_action = 'CANCELADO' then 'CANCELADO: ' || btrim(p_reason) else p_action end);
  end if;

  result := private.order_projection(p_order_id);
  insert into private.order_actions (order_id, request_id, request_hash, result)
  values (p_order_id, p_request_id, payload_hash, result);
  return result;
end;
$$;

grant execute on function public.place_order(uuid, public.receipt_method, public.payment_method, jsonb, jsonb, text) to anon, authenticated;

-- Store operations remain manual. This stage restores real checkout grants.
create or replace function public.set_store_open(p_open boolean)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare saved boolean;
begin
  if not public.is_admin() then raise exception 'administrator required' using errcode = '42501'; end if;
  if p_open is null then raise exception 'store state required' using errcode = '22023'; end if;
  update public.store_settings set is_open = p_open returning is_open into strict saved;
  return saved;
end;
$$;
revoke all on function public.set_store_open(boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_store_open(boolean) to authenticated;
