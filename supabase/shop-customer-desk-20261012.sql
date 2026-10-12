begin;
-- Bounded customer lookups use existing RLS and explicit office-role checks.
create index if not exists customers_shop_name_desk_idx on public."Customers"(shop_id,name,id) where archived is not true;
create index if not exists customers_shop_recent_desk_idx on public."Customers"(shop_id,created_at desc,id) where archived is not true;
create index if not exists customer_units_shop_customer_desk_idx on public.customer_units(shop_id,customer_id) where archived is not true;
create index if not exists shop_ro_customer_desk_idx on public.shop_repair_orders(shop_id,customer_id,created_at desc) where archived is not true;
create index if not exists shop_invoice_customer_desk_idx on public.shop_invoices(shop_id,customer_id,created_at desc);

create or replace function public.shop_customer_directory(p_shop uuid,p_search text default '',p_page integer default 0,p_size integer default 10)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; needle text := lower(trim(coalesce(p_search,''))); digits text := regexp_replace(coalesce(p_search,''),'[^0-9]','','g');
begin
 if not public.has_shop_role(p_shop,array['owner','admin','service_writer']) then raise exception 'Your role cannot open the customer desk.'; end if;
 if p_page is null or p_page<0 or p_page>100000 or p_size is null or p_size<1 or p_size>50 or length(needle)>200 then raise exception 'Invalid customer search or page.'; end if;
 with matched as (
  select c.id,c.name,c.contact_name,c.phone,c.email,c.created_at from public."Customers" c
  where c.shop_id=p_shop and c.archived is not true and (
   needle='' or strpos(lower(concat_ws(' ',c.name,c.contact_name,c.phone,c.email)),needle)>0
   or (length(digits)>=3 and needle !~ '[a-z]' and strpos(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),digits)>0)
   or exists(select 1 from public.customer_units u where u.shop_id=p_shop and u.customer_id=c.id and u.archived is not true
     and strpos(lower(concat_ws(' ',u.name,u.year,u.make,u.model,u.serial)),needle)>0)
  )
 ), page_rows as (select * from matched order by created_at desc nulls last,id limit p_size offset p_page*p_size)
 select jsonb_build_object(
  'count',(select count(*) from matched),
  'summary',jsonb_build_object(
   'customers',(select count(*) from public."Customers" where shop_id=p_shop and archived is not true),
   'vehicles',(select count(*) from public.customer_units where shop_id=p_shop and archived is not true),
   'open_orders',(select count(*) from public.shop_repair_orders where shop_id=p_shop and archived is not true and status not in ('Complete','Closed','Paid')),
   'balance',coalesce((select sum(total) from public.shop_invoices where shop_id=p_shop and status='Sent'),0)),
  'rows',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object(
   'vehicles',(select count(*) from public.customer_units u where u.shop_id=p_shop and u.customer_id=c.id and u.archived is not true),
   'open_orders',(select count(*) from public.shop_repair_orders r where r.shop_id=p_shop and r.customer_id=c.id::text and r.archived is not true and r.status not in ('Complete','Closed','Paid')),
   'balance',coalesce((select sum(i.total) from public.shop_invoices i where i.shop_id=p_shop and i.customer_id=c.id::text and i.status='Sent'),0)
  ) order by c.created_at desc nulls last,c.id) from page_rows c),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create or replace function public.shop_customer_activity(p_shop uuid,p_customer text,p_orders_page integer default 0,p_invoices_page integer default 0)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not public.has_shop_role(p_shop,array['owner','admin','service_writer']) then raise exception 'Your role cannot view customer financial history.'; end if;
 if p_orders_page is null or p_orders_page<0 or p_orders_page>100000 or p_invoices_page is null or p_invoices_page<0 or p_invoices_page>100000 then raise exception 'Invalid history page.'; end if;
 if not exists(select 1 from public."Customers" where shop_id=p_shop and id::text=p_customer and archived is not true) then raise exception 'Customer not found in this shop.'; end if;
 return jsonb_build_object(
  'orders_count',(select count(*) from public.shop_repair_orders where shop_id=p_shop and customer_id=p_customer and archived is not true),
  'invoices_count',(select count(*) from public.shop_invoices where shop_id=p_shop and customer_id=p_customer),
  'balance',coalesce((select sum(total) from public.shop_invoices where shop_id=p_shop and customer_id=p_customer and status='Sent'),0),
  'orders',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (
   select ro_number,legacy_local_id,id,status,unit_name,complaint,created_at from public.shop_repair_orders where shop_id=p_shop and customer_id=p_customer and archived is not true order by created_at desc,id limit 25 offset p_orders_page*25
  )r),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id) from (
   select invoice_number,legacy_local_id,id,status,total,due_date,paid_at,created_at from public.shop_invoices where shop_id=p_shop and customer_id=p_customer order by created_at desc,id limit 25 offset p_invoices_page*25
  )i),'[]'::jsonb)
 );
end $$;
revoke all on function public.shop_customer_directory(uuid,text,integer,integer) from public;
revoke all on function public.shop_customer_activity(uuid,text,integer,integer) from public;
grant execute on function public.shop_customer_directory(uuid,text,integer,integer) to authenticated;
grant execute on function public.shop_customer_activity(uuid,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
select to_regprocedure('public.shop_customer_directory(uuid,text,integer,integer)') is not null as directory_installed,
 to_regprocedure('public.shop_customer_activity(uuid,text,integer,integer)') is not null as activity_installed;
