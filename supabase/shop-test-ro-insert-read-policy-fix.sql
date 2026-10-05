-- TEST ONLY: guvzuufdmnvurshknsnq. Do not run on Live or Snow.
-- Apply after shop-test-floor-role-access.sql. No business records are changed.
-- INSERT RETURNING checks SELECT RLS against the new row. A STABLE helper
-- that re-queries the table cannot see it in that statement's snapshot.
begin;
do $$ begin
 if not exists(select 1 from public.shops where id='ddd8d44c-041f-4510-aa8b-a03b2dde87a6'::uuid)
 or not exists(select 1 from public.shops where id='1161bc88-9ed5-4d76-a2cf-c7a77d41eea9'::uuid)
 or exists(select 1 from public.shops where id not in ('ddd8d44c-041f-4510-aa8b-a03b2dde87a6'::uuid,'1161bc88-9ed5-4d76-a2cf-c7a77d41eea9'::uuid)) then
  raise exception 'STOP: expected only the verified Shop Test A/B IDs';
 end if;
end $$;

drop policy if exists "assigned ro read boundary" on public.shop_repair_orders;
create policy "assigned ro read boundary" on public.shop_repair_orders
 as restrictive for select to authenticated
 using (
  public.shop_has_permission(shop_id,'repair_orders.read')
  and (
   not public.has_shop_role(shop_id,array['technician'])
   or coalesce(auth.uid() in (technician_user_id,additional_technician_user_id),false)
  )
 );
commit;
select policyname, permissive, cmd, qual from pg_policies
where schemaname='public' and tablename='shop_repair_orders'
 and policyname='assigned ro read boundary';
