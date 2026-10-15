begin;
-- Run after shop-customer-billing-20261014.sql. Read-only views of existing money records.
create index if not exists shop_invoice_outstanding_customer_idx on public.shop_invoices(shop_id,customer_id,due_date,id) where status='Sent' and balance_due>0;
create or replace function public.shop_net_accounts(
 p_shop uuid,p_search text default '',p_filter text default 'all',p_sort text default 'balance',
 p_page integer default 0,p_size integer default 25,p_customer text default null
) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb;shop_day date;needle text:=lower(trim(coalesce(p_search,'')));
begin
 if not public.has_shop_role(p_shop,array['owner','admin','service_writer']) then raise exception 'Your role cannot open NET Accounts.';end if;
 if p_page is null or p_page<0 or p_page>100000 or p_size is null or p_size not in (10,25,50)
 or length(needle)>200 or p_filter is null or p_filter not in ('all','outstanding','overdue','hold','current')
 or p_sort is null or p_sort not in ('balance','overdue','alphabetical') then raise exception 'Invalid NET Accounts query.';end if;
 select (now() at time zone coalesce(nullif(timezone,''),'UTC'))::date into shop_day from public.shops where id=p_shop;
 with eligible as (
  select c.id::text id,c.name,c.contact_name,c.phone,c.email,c.archived,
   coalesce(b.account_number,'') account_number,coalesce(b.terms_days,0) terms_days,
   coalesce(b.account_status,'active') account_status,b.credit_limit,
   coalesce(nullif(b.billing_contact,''),c.contact_name,'') billing_contact,
   coalesce(nullif(b.billing_email,''),c.email,'') billing_email,
   coalesce(nullif(b.billing_phone,''),c.phone,'') billing_phone
  from public."Customers" c left join public.customer_billing_profiles b on b.shop_id=c.shop_id and b.customer_id=c.id::text
  where c.shop_id=p_shop and ((coalesce(b.terms_days,0)>0 and c.archived is not true)
   or exists(select 1 from public.shop_invoices i where i.shop_id=p_shop and i.customer_id=c.id::text and i.status='Sent' and i.balance_due>0 and coalesce((i.billing_snapshot->>'termsDays')::integer,0)>0))
 ), balances as (
  select c.*,coalesce(f.balance,0) balance,coalesce(f.overdue,0) overdue,coalesce(f.current_amount,0) current_amount,
   coalesce(f.age_1_30,0) age_1_30,coalesce(f.age_31_60,0) age_31_60,coalesce(f.age_61_90,0) age_61_90,coalesce(f.age_90_plus,0) age_90_plus,
   coalesce(f.undated,0) undated,coalesce(f.invoice_count,0) invoice_count,f.oldest_due
  from eligible c left join lateral (
   select sum(i.balance_due) balance,sum(i.balance_due) filter(where i.due_date<shop_day) overdue,
    sum(i.balance_due) filter(where i.due_date>=shop_day) current_amount,
    sum(i.balance_due) filter(where shop_day-i.due_date between 1 and 30) age_1_30,
    sum(i.balance_due) filter(where shop_day-i.due_date between 31 and 60) age_31_60,
    sum(i.balance_due) filter(where shop_day-i.due_date between 61 and 90) age_61_90,
    sum(i.balance_due) filter(where shop_day-i.due_date>90) age_90_plus,
    sum(i.balance_due) filter(where i.due_date is null) undated,count(*) invoice_count,min(i.due_date) oldest_due
   from public.shop_invoices i where i.shop_id=p_shop and i.customer_id=c.id and i.status='Sent' and i.balance_due>0
  ) f on true
 ), matched as (
  select * from balances c where (needle='' or strpos(lower(concat_ws(' ',name,account_number,contact_name,phone,email,billing_contact,billing_email,billing_phone)),needle)>0)
   and case p_filter when 'outstanding' then balance>0 when 'overdue' then overdue>0 when 'hold' then account_status='hold' when 'current' then balance=0 else true end
   and (p_customer is null or c.id=p_customer)
 ), ranked as (
  select *,row_number() over(order by case when p_sort='balance' then balance end desc nulls last,
   case when p_sort='overdue' then oldest_due end asc nulls last,lower(name),id) position from matched
 ), page_rows as(select * from ranked order by position limit p_size offset p_page*p_size)
 select jsonb_build_object('as_of',shop_day,'count',(select count(*) from matched),
  'summary',(select jsonb_build_object('accounts',count(*),'balance',coalesce(sum(balance),0),'overdue',coalesce(sum(overdue),0),
   'current_amount',coalesce(sum(current_amount),0),'age_1_30',coalesce(sum(age_1_30),0),'age_31_60',coalesce(sum(age_31_60),0),
   'age_61_90',coalesce(sum(age_61_90),0),'age_90_plus',coalesce(sum(age_90_plus),0),'undated',coalesce(sum(undated),0)) from matched),
  'rows',coalesce((select jsonb_agg(to_jsonb(c)-'position' order by position) from page_rows c),'[]')) into result;
 return result;
end $$;
revoke all on function public.shop_net_accounts(uuid,text,text,text,integer,integer,text) from public;
grant execute on function public.shop_net_accounts(uuid,text,text,text,integer,integer,text) to authenticated;
create or replace function public.shop_net_account_invoices(p_shop uuid,p_customer text,p_page integer default 0,p_size integer default 25)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare account_data jsonb;result jsonb;shop_day date;
begin
 account_data:=public.shop_net_accounts(p_shop,'','all','balance',0,10,p_customer);
 if jsonb_array_length(account_data->'rows')=0 then raise exception 'NET account not found or unavailable.';end if;
 if p_page is null or p_page<0 or p_page>100000 or p_size is null or p_size not in (10,25,50) then raise exception 'Invalid invoice page.';end if;
 shop_day:=(account_data->>'as_of')::date;
 with outstanding as (
  select i.id,i.invoice_number,i.legacy_local_id,i.repair_order_id,i.total,i.paid_total,i.balance_due,i.due_date,i.sent_at,i.purchase_order,
   coalesce((i.billing_snapshot->>'termsDays')::integer,0) terms_days,
   case when i.due_date is null then null else greatest(0,shop_day-i.due_date) end days_overdue,
   r.ro_number,r.status ro_status
  from public.shop_invoices i left join public.shop_repair_orders r on r.id=i.repair_order_id and r.shop_id=i.shop_id
  where i.shop_id=p_shop and i.customer_id=p_customer and i.status='Sent' and i.balance_due>0
 ), page_rows as(select * from outstanding order by due_date asc nulls last,id limit p_size offset p_page*p_size)
 select jsonb_build_object('account',account_data->'rows'->0,'as_of',shop_day,'count',(select count(*) from outstanding),
  'rows',coalesce((select jsonb_agg(to_jsonb(i) order by i.due_date asc nulls last,i.id) from page_rows i),'[]')) into result;
 return result;
end $$;
revoke all on function public.shop_net_account_invoices(uuid,text,integer,integer) from public;
grant execute on function public.shop_net_account_invoices(uuid,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
select to_regprocedure('public.shop_net_accounts(uuid,text,text,text,integer,integer,text)') is not null net_accounts_installed,
 to_regprocedure('public.shop_net_account_invoices(uuid,text,integer,integer)') is not null net_invoices_installed;
