create function private.br_field(p_tag text, p_value text)
returns text language sql immutable strict set search_path = ''
as $$ select p_tag || lpad(octet_length(p_value)::text, 2, '0') || p_value $$;

create function private.pix_payload(p_amount bigint, p_reference text, p_receiver public.payment_settings)
returns text language plpgsql immutable strict set search_path = ''
as $$
declare
  payload text;
  bytes bytea;
  crc integer := 65535;
begin
  payload := '000201'
    || private.br_field('26', '0014br.gov.bcb.pix' || private.br_field('01', p_receiver.pix_key))
    || '520400005303986'
    || private.br_field('54', (p_amount / 100)::text || '.' || lpad((p_amount % 100)::text, 2, '0'))
    || '5802BR' || private.br_field('59', p_receiver.receiver_name) || private.br_field('60', p_receiver.receiver_city)
    || private.br_field('62', private.br_field('05', p_reference)) || '6304';
  bytes := convert_to(payload, 'UTF8');
  for i in 0..octet_length(bytes) - 1 loop
    crc := crc # (get_byte(bytes, i) << 8);
    for bit in 1..8 loop
      crc := ((crc << 1) # (case when (crc & 32768) <> 0 then 4129 else 0 end)) & 65535;
    end loop;
  end loop;
  return payload || upper(lpad(to_hex(crc), 4, '0'));
end;
$$;

create function private.guest_token(p_order uuid, p_request uuid)
returns text language sql stable strict set search_path = ''
as $$
  select encode(extensions.hmac(convert_to(p_order::text || ':' || p_request::text, 'UTF8'), secret, 'sha256'), 'hex')
  from private.token_signing_key where singleton;
$$;

create function private.order_projection(p_order uuid)
returns jsonb language sql stable strict set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'number', 'BD-' || o.public_number, 'status', o.status, 'financial_status', p.status,
    'revision', o.revision, 'created_at', o.created_at, 'finished_at', o.finished_at,
    'receipt_method', o.receipt_method, 'payment_method', p.method,
    'total_cents', o.total_cents, 'products_cents', o.products_cents, 'discount_cents', o.discount_cents,
    'delivery_fee_cents', o.delivery_fee_cents, 'expires_at', p.expires_at,
    'pix_payload', case when o.status = 'AGUARDANDO_PAGAMENTO' then p.pix_payload end,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'name', i.product_name, 'description', i.description, 'size', i.size, 'image_path', i.image_path,
        'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents, 'subtotal_cents', i.subtotal_cents, 'is_reward', i.is_reward
      ) order by i.is_reward, i.product_name) from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o join public.payments p on p.order_id = o.id where o.id = p_order;
$$;

create function private.record_order_event(p_order uuid, p_actor uuid, p_reason text)
returns void language plpgsql set search_path = ''
as $$
declare
  event_id uuid;
  event_revision integer;
begin
  insert into public.order_status_history (order_id, revision, operational_status, financial_status, actor_id, reason)
  select o.id, o.revision, o.status, p.status, p_actor, p_reason
  from public.orders o join public.payments p on p.order_id = o.id where o.id = p_order
  returning id, revision into strict event_id, event_revision;

  if event_revision > 0 then
    insert into public.notification_events (order_history_id) values (event_id);
  end if;
end;
$$;

create function private.lock_loyalty(p_profile uuid)
returns void language plpgsql set search_path = ''
as $$
begin
  insert into public.loyalty_accounts (profile_id) values (p_profile) on conflict do nothing;
  perform 1 from public.loyalty_accounts where profile_id = p_profile for update;
end;
$$;

create function private.reward_movement(p_order public.orders, p_action text)
returns boolean language plpgsql set search_path = ''
as $$
declare
  reward uuid;
  next_state text;
  next_order uuid;
begin
  if p_order.customer_id is null then return false; end if;
  perform private.lock_loyalty(p_order.customer_id);

  if p_action = 'reserve' then
    select id into reward from public.loyalty_rewards
    where profile_id = p_order.customer_id and state = 'available'
    order by created_at, id limit 1;
    next_state := 'reserved';
    next_order := p_order.id;
  else
    select id into reward from public.loyalty_rewards
    where profile_id = p_order.customer_id and order_id = p_order.id
      and state = case when p_action = 'restore' then 'redeemed' else 'reserved' end;
    next_state := case when p_action = 'redeem' then 'redeemed' else 'available' end;
    next_order := case when p_action = 'redeem' then p_order.id end;
  end if;
  if reward is null then return false; end if;

  update public.loyalty_rewards set state = next_state, order_id = next_order where id = reward;
  insert into public.loyalty_transactions (profile_id, order_id, reward_id, movement, delta, event_key)
  values (p_order.customer_id, p_order.id, reward, p_action, 0, p_order.id || ':' || p_action || ':' || p_order.revision || ':' || reward);
  return true;
end;
$$;

create function private.apply_stamps(p_order public.orders, p_refund boolean)
returns void language plpgsql set search_path = ''
as $$
declare
  units integer;
  balance bigint;
  reward uuid;
  stamp_action text := case when p_refund then 'refund' else 'credit' end;
begin
  if p_order.customer_id is null then return; end if;
  perform private.lock_loyalty(p_order.customer_id);
  select coalesce(sum(quantity), 0)::integer into units from public.order_items
  where order_id = p_order.id and earns_stamps and not is_reward and unit_price_cents > 0;
  if units = 0 then return; end if;
  if p_refund then units := -units; end if;

  insert into public.loyalty_transactions (profile_id, order_id, movement, delta, event_key)
  values (p_order.customer_id, p_order.id, stamp_action, units, p_order.id || ':' || stamp_action)
  on conflict (event_key) do nothing;
  if not found then return; end if;

  select stamp_balance + units into strict balance from public.loyalty_accounts where profile_id = p_order.customer_id;
  while balance >= 9 loop
    insert into public.loyalty_rewards (profile_id) values (p_order.customer_id) returning id into reward;
    insert into public.loyalty_transactions (profile_id, order_id, reward_id, movement, delta, event_key)
    values (p_order.customer_id, p_order.id, reward, 'issue', -9, p_order.id || ':issue:' || reward);
    balance := balance - 9;
  end loop;
  while balance < 0 and p_refund loop
    select id into reward from public.loyalty_rewards where profile_id = p_order.customer_id and state = 'available'
    order by created_at desc, id limit 1;
    exit when not found;
    update public.loyalty_rewards set state = 'revoked' where id = reward;
    insert into public.loyalty_transactions (profile_id, order_id, reward_id, movement, delta, event_key)
    values (p_order.customer_id, p_order.id, reward, 'revoke', 9, p_order.id || ':revoke:' || reward);
    balance := balance + 9;
  end loop;
  update public.loyalty_accounts set stamp_balance = balance where profile_id = p_order.customer_id;
end;
$$;

create function private.expire_order(p_order uuid)
returns boolean language plpgsql set search_path = ''
as $$
declare
  order_row public.orders;
begin
  select * into order_row from public.orders where id = p_order and status = 'AGUARDANDO_PAGAMENTO' for update;
  if not found then return false; end if;
  update public.payments set status = 'EXPIRADO' where order_id = p_order and status = 'PENDENTE' and expires_at <= clock_timestamp();
  if not found then return false; end if;
  update public.orders set status = 'REVISAO_MANUAL', revision = revision + 1 where id = p_order returning * into order_row;
  perform private.reward_movement(order_row, 'release');
  perform private.record_order_event(p_order, null, 'pix_expired');
  return true;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated, service_role;
