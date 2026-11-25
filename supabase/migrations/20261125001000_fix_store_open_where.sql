create or replace function public.set_store_open(p_open boolean)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare saved boolean;
begin
  if not public.is_admin() then raise exception 'administrator required' using errcode = '42501'; end if;
  if p_open is null then raise exception 'store state required' using errcode = '22023'; end if;
  update public.store_settings
  set is_open = p_open
  where id = '00000000-0000-4000-8000-000000000001'
  returning is_open into strict saved;
  return saved;
end;
$$;
