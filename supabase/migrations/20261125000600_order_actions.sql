create function public.admin_order_action(
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
    perform private.record_order_event(p_order_id, uid, p_action);
  end if;

  result := private.order_projection(p_order_id);
  insert into private.order_actions (order_id, request_id, request_hash, result)
  values (p_order_id, p_request_id, payload_hash, result);
  return result;
end;
$$;

create function public.expire_pix_orders(p_limit integer default 100)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  target uuid;
  expired integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'invalid batch size' using errcode = '22023'; end if;
  for target in
    select o.id from public.payments p join public.orders o on o.id = p.order_id
    where p.status = 'PENDENTE' and p.expires_at <= clock_timestamp() and o.status = 'AGUARDANDO_PAGAMENTO'
    order by o.customer_id nulls first, o.id limit p_limit for update of o skip locked
  loop
    if private.expire_order(target) then expired := expired + 1; end if;
  end loop;
  return expired;
end;
$$;

create function public.admin_financial_summary(p_from timestamptz, p_until timestamptz)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then raise exception 'administrator required' using errcode = '42501'; end if;
  if p_from is null or p_until is null or p_from >= p_until then raise exception 'invalid period' using errcode = '22023'; end if;
  select jsonb_build_object(
    'received_cents', coalesce(sum(p.amount_cents) filter (where p.confirmed_at >= p_from and p.confirmed_at < p_until), 0),
    'refunded_cents', coalesce(sum(p.amount_cents) filter (where p.refunded_at >= p_from and p.refunded_at < p_until), 0),
    'pending_cents', coalesce(sum(p.amount_cents) filter (where p.status in ('PENDENTE', 'EXPIRADO') and o.created_at >= p_from and o.created_at < p_until), 0),
    'canceled_orders', count(*) filter (where o.status = 'CANCELADO' and o.finished_at >= p_from and o.finished_at < p_until)
  ) into result from public.payments p join public.orders o on o.id = p.order_id
  where (p.confirmed_at >= p_from and p.confirmed_at < p_until)
     or (p.refunded_at >= p_from and p.refunded_at < p_until)
     or (o.created_at >= p_from and o.created_at < p_until)
     or (o.finished_at >= p_from and o.finished_at < p_until);
  return result;
end;
$$;

revoke all on function public.admin_order_action(uuid, uuid, text, text, text), public.expire_pix_orders(integer),
  public.admin_financial_summary(timestamptz, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.admin_order_action(uuid, uuid, text, text, text),
  public.admin_financial_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.expire_pix_orders(integer) to service_role;
