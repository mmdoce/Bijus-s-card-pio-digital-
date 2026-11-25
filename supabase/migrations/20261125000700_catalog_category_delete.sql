-- The existing categories_admin policy authorizes only administrators.
-- The products.category_id foreign key uses ON DELETE RESTRICT.
grant delete on table public.categories to authenticated;
