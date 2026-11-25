revoke execute on function public.place_order(uuid, public.receipt_method, public.payment_method, jsonb, jsonb, text)
from public, anon, authenticated;

create function public.set_store_open(p_open boolean)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  checkout_function constant text := 'public.place_order(uuid,public.receipt_method,public.payment_method,jsonb,jsonb,text)';
  saved boolean;
begin
  if not public.is_admin() then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_open is null then
    raise exception 'store state required' using errcode = '22023';
  end if;
  if p_open and (has_function_privilege('anon', checkout_function, 'EXECUTE')
    or has_function_privilege('authenticated', checkout_function, 'EXECUTE')) then
    raise exception 'checkout must stay disabled' using errcode = 'P0001';
  end if;
  update public.store_settings set is_open = p_open
    where id = '00000000-0000-4000-8000-000000000001'
    returning is_open into strict saved;
  return saved;
end;
$$;

revoke all on function public.set_store_open(boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_store_open(boolean) to authenticated;
