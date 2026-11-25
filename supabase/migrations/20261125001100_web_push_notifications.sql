alter table public.notification_events alter column order_history_id drop not null;
alter table public.notification_events
  add column reward_id uuid unique references public.loyalty_rewards(id) on delete restrict,
  add constraint notification_event_source check (num_nonnulls(order_history_id, reward_id) = 1);
create index notification_events_time_idx on public.notification_events (created_at, id);

alter table public.push_subscriptions
  add column audience text not null default 'customer' check (audience in ('customer', 'admin', 'guest')),
  add column admin_user_id uuid references public.admin_users(user_id) on delete cascade,
  drop constraint push_subscriptions_check;
update public.push_subscriptions set audience = 'guest' where guest_order_id is not null;
alter table public.push_subscriptions add constraint push_subscription_owner check (
  num_nonnulls(profile_id, admin_user_id, guest_order_id) = 1
  and ((audience = 'guest') = (guest_order_id is not null))
  and ((audience = 'admin') = (admin_user_id is not null))
);
create unique index push_admin_endpoint_uidx on public.push_subscriptions (admin_user_id, endpoint) where admin_user_id is not null;
create index push_active_endpoint_idx on public.push_subscriptions (endpoint) where revoked_at is null;
alter table private.notification_deliveries add column lease uuid;

create table private.push_devices (
  endpoint text primary key,
  secret_hash bytea not null
);
alter table private.push_devices enable row level security;

create function private.valid_push_endpoint(p_endpoint text)
returns boolean language sql immutable set search_path = ''
as $$
  select char_length(p_endpoint) <= 2048 and p_endpoint ~
    '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|([a-z0-9-]+[.])?notify[.]windows[.]com|([a-z0-9-]+[.])?push[.]apple[.]com)/[A-Za-z0-9_/?=.%:+&~-]+$';
$$;

create function public.register_web_push(
  p_endpoint text, p_p256dh text, p_auth text, p_secret text, p_audience text, p_guest_tokens text[]
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  secret_hash bytea;
  saved_hash bytea;
  guest_id uuid;
begin
  if not coalesce(private.valid_push_endpoint(p_endpoint), false)
    or not coalesce(p_secret ~ '^[a-f0-9]{64}$', false)
    or not coalesce(p_p256dh ~ '^[A-Za-z0-9_-]{87}$', false)
    or not coalesce(p_auth ~ '^[A-Za-z0-9_-]{22}$', false)
    or p_audience is null or p_audience not in ('admin', 'customer', 'guest')
    or coalesce(cardinality(p_guest_tokens), 0) > 50 then
    raise exception 'invalid push subscription' using errcode = '22023';
  end if;
  if (p_audience = 'admin' and not public.is_admin())
    or (p_audience = 'customer' and not exists (select 1 from public.profiles where id = uid))
    or (p_audience = 'guest' and coalesce(cardinality(p_guest_tokens), 0) = 0) then
    raise exception 'push subscription forbidden' using errcode = '42501';
  end if;

  secret_hash := extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256');
  insert into private.push_devices (endpoint, secret_hash) values (p_endpoint, secret_hash)
    on conflict (endpoint) do nothing;
  select d.secret_hash into strict saved_hash from private.push_devices d where d.endpoint = p_endpoint for update;
  if saved_hash <> secret_hash then raise exception 'push device forbidden' using errcode = '42501'; end if;

  update public.push_subscriptions set revoked_at = now()
    where endpoint = p_endpoint and revoked_at is null
      and ((p_audience = 'guest' and audience <> 'guest')
        or (p_audience <> 'guest' and coalesce(profile_id, admin_user_id) is distinct from uid));
  if p_audience = 'guest' then
    for guest_id in select t.order_id from private.guest_order_tokens t
      join (select distinct extensions.digest(convert_to(token, 'UTF8'), 'sha256') as hash
            from unnest(p_guest_tokens) as keys(token) where token ~ '^[a-f0-9]{64}$') k on k.hash = t.token_hash
    loop
      insert into public.push_subscriptions (guest_order_id, endpoint, p256dh, auth_secret, audience)
        values (guest_id, p_endpoint, p_p256dh, p_auth, 'guest')
      on conflict (guest_order_id, endpoint) where guest_order_id is not null do update
        set p256dh = excluded.p256dh, auth_secret = excluded.auth_secret, revoked_at = null,
            created_at = case when push_subscriptions.revoked_at is null then push_subscriptions.created_at else now() end;
    end loop;
    if not found then raise exception 'guest tracking required' using errcode = '42501'; end if;
  elsif p_audience = 'admin' then
    insert into public.push_subscriptions (admin_user_id, endpoint, p256dh, auth_secret, audience)
      values (uid, p_endpoint, p_p256dh, p_auth, 'admin')
    on conflict (admin_user_id, endpoint) where admin_user_id is not null do update
      set p256dh = excluded.p256dh, auth_secret = excluded.auth_secret, revoked_at = null,
          created_at = case when push_subscriptions.revoked_at is null then push_subscriptions.created_at else now() end;
  else
    insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_secret, audience)
      values (uid, p_endpoint, p_p256dh, p_auth, p_audience)
    on conflict (profile_id, endpoint) where profile_id is not null do update
      set p256dh = excluded.p256dh, auth_secret = excluded.auth_secret, revoked_at = null,
          created_at = case when push_subscriptions.revoked_at is null then push_subscriptions.created_at else now() end;
  end if;
end;
$$;

create function public.revoke_web_push(p_endpoint text, p_secret text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(p_secret ~ '^[a-f0-9]{64}$', false) then
    raise exception 'push device forbidden' using errcode = '42501';
  end if;
  perform 1 from private.push_devices d where d.endpoint = p_endpoint
    and d.secret_hash = extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256') for update;
  if not found then raise exception 'push device forbidden' using errcode = '42501'; end if;
  update public.push_subscriptions set revoked_at = now() where endpoint = p_endpoint and revoked_at is null;
end;
$$;

create function public.acknowledge_web_push(p_endpoint text, p_secret text, p_admin boolean, p_events uuid[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(p_secret ~ '^[a-f0-9]{64}$', false) or coalesce(cardinality(p_events), 0) not between 1 and 100 then
    raise exception 'invalid push acknowledgement' using errcode = '22023';
  end if;
  if not exists (select 1 from private.push_devices d where d.endpoint = p_endpoint
    and d.secret_hash = extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256')) then
    raise exception 'push device forbidden' using errcode = '42501';
  end if;
  update private.notification_deliveries d set state = 'sent', sent_at = now()
    from public.push_subscriptions s
    where d.event_id = any(p_events) and d.subscription_id = s.id and d.state = 'pending' and d.lease is null
      and s.endpoint = p_endpoint and (s.audience = 'admin') = p_admin;
end;
$$;

create view private.notification_payloads as
select e.id, e.created_at as occurred_at, h.order_id, coalesce(o.customer_id, r.profile_id) as profile_id,
  case when h.revision = 0 then 'new_order' when h.reason = 'pix_expired' then 'manual_review' end as admin_kind,
  case when e.reward_id is not null then 'reward'
    when h.revision = 0 and h.operational_status = 'EM_PREPARO' then 'preparing'
    when h.reason = 'confirm' then 'paid'
    when h.reason = 'pix_expired' then 'expired'
    when h.reason = 'EM_PREPARO' then 'preparing'
    when h.reason = 'PRONTO' then 'pickup'
    when h.reason = 'SAIU_PARA_ENTREGA' then 'delivery'
    when h.reason = 'CONCLUIDO' then 'completed'
    when h.operational_status = 'CANCELADO' and h.reason like 'CANCELADO%' then 'canceled'
  end as customer_kind,
  h.reason = 'confirm' and h.operational_status = 'EM_PREPARO' and p.method = 'pix' as started_preparing
from public.notification_events e
left join public.order_status_history h on h.id = e.order_history_id
left join public.orders o on o.id = h.order_id
left join public.payments p on p.order_id = o.id
left join public.loyalty_rewards r on r.id = e.reward_id;

create function private.capture_notification_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'order_status_history' then
    insert into public.notification_events (order_history_id) values (new.id) on conflict do nothing;
  else
    insert into public.notification_events (reward_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- Existing order actions already insert events for revisions above zero.
create trigger push_new_order after insert on public.order_status_history
for each row when (new.revision = 0) execute function private.capture_notification_event();
create trigger push_new_reward after insert on public.loyalty_rewards
for each row when (new.state = 'available') execute function private.capture_notification_event();

create function public.get_notification_feed(p_admin boolean, p_since timestamptz, p_guest_tokens text[])
returns table (id uuid, occurred_at timestamptz, order_id uuid, kind text, started_preparing boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_admin and not public.is_admin() then raise exception 'administrator required' using errcode = '42501'; end if;
  if coalesce(cardinality(p_guest_tokens), 0) > 50 then raise exception 'too many guest tokens' using errcode = '22023'; end if;
  return query
    with guests as (
      select t.order_id from private.guest_order_tokens t
      join (select distinct extensions.digest(convert_to(token, 'UTF8'), 'sha256') as hash
            from unnest(p_guest_tokens) as keys(token) where token ~ '^[a-f0-9]{64}$') k on k.hash = t.token_hash
    )
    select n.id, n.occurred_at, n.order_id, case when p_admin then n.admin_kind else n.customer_kind end,
      coalesce(n.started_preparing, false)
    from private.notification_payloads n
    where n.occurred_at >= greatest(p_since, now() - interval '1 day')
      and ((p_admin and n.admin_kind is not null)
        or (not p_admin and n.customer_kind is not null
          and (n.profile_id = (select auth.uid()) or (n.profile_id is null and n.order_id in (select g.order_id from guests g)))))
    order by n.occurred_at desc, n.id desc limit 1000;
end;
$$;

create function private.queue_push_notification()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.notification_deliveries (event_id, subscription_id)
  select new.id, s.id from private.notification_payloads n
  join public.push_subscriptions s on s.revoked_at is null and s.created_at <= n.occurred_at
    and ((s.audience = 'admin' and n.admin_kind is not null
           and exists (select 1 from public.admin_users a where a.user_id = s.admin_user_id))
      or (s.audience = 'customer' and n.customer_kind is not null and s.profile_id = n.profile_id)
      or (s.audience = 'guest' and n.customer_kind is not null and n.profile_id is null and s.guest_order_id = n.order_id))
  where n.id = new.id and private.valid_push_endpoint(s.endpoint)
  on conflict do nothing;
  return new;
end;
$$;

create trigger queue_push_notification after insert on public.notification_events
for each row execute function private.queue_push_notification();

create function public.claim_web_push()
returns table (
  event_id uuid, subscription_id uuid, lease uuid, endpoint text, p256dh text, auth_secret text,
  audience text, kind text, order_id uuid, started_preparing boolean
)
language plpgsql security definer set search_path = ''
as $$
begin
  update private.notification_deliveries d set state = 'failed', lease = null
    where d.state = 'pending' and d.next_attempt_at <= now() and
      (d.attempts >= 5 or exists (select 1 from public.notification_events e
        where e.id = d.event_id and e.created_at < now() - interval '1 day'));

  return query
    with selected as (
      select d.event_id, d.subscription_id from private.notification_deliveries d
      where d.state = 'pending' and d.next_attempt_at <= now()
      order by d.next_attempt_at limit 25 for update skip locked
    ), claimed as (
      update private.notification_deliveries d
      set attempts = d.attempts + 1, lease = gen_random_uuid(), next_attempt_at = now() + interval '2 minutes'
      from selected c where d.event_id = c.event_id and d.subscription_id = c.subscription_id
      returning d.event_id, d.subscription_id, d.lease
    )
    select c.event_id, c.subscription_id, c.lease,
      case when eligible.ok then s.endpoint end, s.p256dh, s.auth_secret, s.audience,
      case when s.audience = 'admin' then n.admin_kind else n.customer_kind end, n.order_id,
      coalesce(n.started_preparing, false)
    from claimed c join public.push_subscriptions s on s.id = c.subscription_id
    join private.notification_payloads n on n.id = c.event_id
    cross join lateral (
      select s.revoked_at is null and s.created_at <= n.occurred_at and private.valid_push_endpoint(s.endpoint)
        and ((s.audience = 'admin' and n.admin_kind is not null
            and exists (select 1 from public.admin_users a where a.user_id = s.admin_user_id))
          or (s.audience = 'customer' and n.customer_kind is not null and s.profile_id = n.profile_id)
          or (s.audience = 'guest' and n.customer_kind is not null and n.profile_id is null and s.guest_order_id = n.order_id)) as ok
    ) eligible;
end;
$$;

create function public.finish_web_push(p_event uuid, p_subscription uuid, p_lease uuid, p_result text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  affected uuid;
begin
  if p_result is null or p_result not in ('sent', 'retry', 'expired', 'failed') then
    raise exception 'invalid delivery result' using errcode = '22023';
  end if;
  update private.notification_deliveries d
    set state = case when p_result = 'sent' then 'sent' when p_result = 'retry' and attempts < 5 then 'pending' else 'failed' end,
      next_attempt_at = now() + make_interval(mins => d.attempts), lease = null,
      sent_at = case when p_result = 'sent' then now() end
    where d.event_id = p_event and d.subscription_id = p_subscription and d.lease = p_lease and d.state = 'pending'
    returning d.subscription_id into affected;
  if p_result = 'expired' and affected is not null then
    update public.push_subscriptions s set revoked_at = now()
      where s.revoked_at is null and s.endpoint = (select t.endpoint from public.push_subscriptions t where t.id = affected);
  end if;
end;
$$;

revoke all on function private.valid_push_endpoint(text), private.capture_notification_event(), private.queue_push_notification()
  from public, anon, authenticated;
revoke all on function public.register_web_push(text,text,text,text,text,text[]), public.revoke_web_push(text,text),
  public.acknowledge_web_push(text,text,boolean,uuid[]),
  public.get_notification_feed(boolean,timestamptz,text[]), public.claim_web_push(), public.finish_web_push(uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_web_push(text,text,text,text,text,text[]), public.revoke_web_push(text,text),
  public.acknowledge_web_push(text,text,boolean,uuid[]),
  public.get_notification_feed(boolean,timestamptz,text[]) to anon, authenticated;
grant execute on function public.claim_web_push(), public.finish_web_push(uuid,uuid,uuid,text) to service_role;
