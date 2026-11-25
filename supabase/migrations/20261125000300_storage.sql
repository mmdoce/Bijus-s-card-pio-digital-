insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create function public.can_change_product_image(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.is_admin()
    and not exists (select 1 from public.products where image_path = p_name)
    and not exists (select 1 from public.order_items where image_path = p_name);
$$;
revoke all on function public.can_change_product_image(text) from public, anon, authenticated, service_role;
grant execute on function public.can_change_product_image(text) to authenticated;

create policy product_images_admin_list on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_admin_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.can_change_product_image(name))
  with check (bucket_id = 'product-images' and public.can_change_product_image(name));
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.can_change_product_image(name));
