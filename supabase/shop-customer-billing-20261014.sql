begin;
-- Run after customer-tax-settings.sql and shop-payment-ledger-20261014.sql.
create table if not exists public.customer_billing_profiles (
 customer_id text primary key, shop_id uuid not null references public.shops(id),
 account_number text not null default '', terms_days integer not null default 0 check(terms_days between 0 and 365),
 credit_limit numeric(12,2) check(credit_limit>=0 and credit_limit<=9999999999.99), po_required boolean not null default false,
 billing_contact text not null default '', billing_email text not null default '', billing_phone text not null default '',
 account_status text not null default 'active' check(account_status in ('active','hold')),
 updated_at timestamptz not null default now()
);
create unique index if not exists customer_account_number_unique on public.customer_billing_profiles(shop_id,lower(account_number)) where account_number<>'';
create table if not exists public.customer_billing_audit (
 id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(id),customer_id text not null,
 setting_type text not null,before_values jsonb,after_values jsonb,recorded_by uuid references auth.users(id),recorded_by_email text not null default '',recorded_at timestamptz not null default now()
);
alter table public.customer_billing_profiles enable row level security;
alter table public.customer_billing_audit enable row level security;
drop policy if exists "office reads billing preferences" on public.customer_billing_profiles;
create policy "office reads billing preferences" on public.customer_billing_profiles for select to authenticated using(public.has_shop_role(shop_id,array['owner','admin','service_writer']));
drop policy if exists "managers read billing audit" on public.customer_billing_audit;
create policy "managers read billing audit" on public.customer_billing_audit for select to authenticated using(public.has_shop_role(shop_id,array['owner','admin']));
revoke all on public.customer_billing_profiles,public.customer_billing_audit from authenticated;
grant select on public.customer_billing_profiles,public.customer_billing_audit to authenticated;
create or replace function public.audit_customer_billing() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then raise exception 'Billing preferences cannot be deleted; update their settings instead.'; end if;
 if not public.has_shop_role(new.shop_id,array['owner','admin']) then raise exception 'Owner or admin access is required to change financial settings.'; end if;
 if not exists(select 1 from public."Customers" where id::text=new.customer_id and shop_id=new.shop_id) then raise exception 'Customer does not belong to this shop'; end if;
 if tg_op='UPDATE' and (new.customer_id is distinct from old.customer_id or new.shop_id is distinct from old.shop_id) then raise exception 'Billing profile identity cannot change'; end if;
 new.updated_at:=now();
 if tg_op='INSERT' or (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
 insert into public.customer_billing_audit(shop_id,customer_id,setting_type,before_values,after_values,recorded_by,recorded_by_email)
 values(new.shop_id,new.customer_id,tg_table_name,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid(),coalesce((select email from auth.users where id=auth.uid()),''));
 end if;return new;
end $$;
drop trigger if exists customer_billing_audit on public.customer_billing_profiles;
create trigger customer_billing_audit before insert or update or delete on public.customer_billing_profiles for each row execute function public.audit_customer_billing();
drop trigger if exists customer_tax_audit on public.customer_tax_profiles;
create trigger customer_tax_audit before insert or update or delete on public.customer_tax_profiles for each row execute function public.audit_customer_billing();
drop trigger if exists immutable_customer_billing_audit on public.customer_billing_audit;
create trigger immutable_customer_billing_audit before update or delete on public.customer_billing_audit for each row execute function public.immutable_shop_payment();
create or replace function public.save_shop_customer_billing(p_shop uuid,p_customer text,p_values jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.customer_billing_profiles; certificate text:=coalesce(p_values->>'exemption_certificate_path','');
begin
 if not public.has_shop_role(p_shop,array['owner','admin']) then raise exception 'Owner or admin access is required to change financial settings.'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or length(p_values::text)>10000 then raise exception 'Invalid billing preferences';end if;
 perform 1 from public."Customers" where id::text=p_customer and shop_id=p_shop for update;
 if not found then raise exception 'Customer not found in this shop'; end if;
 if certificate<>'' and (split_part(certificate,'/',1)<>p_shop::text or split_part(certificate,'/',2)<>p_customer or not exists(select 1 from storage.objects where bucket_id='customer-tax-certificates' and name=certificate)) then raise exception 'Invalid customer exemption document'; end if;
 if p_values->>'tax_status' not in ('inherit','taxable','exempt') or p_values->>'tax_status' is null then raise exception 'Select a tax status'; end if;
 insert into public.customer_billing_profiles(customer_id,shop_id,account_number,terms_days,credit_limit,po_required,billing_contact,billing_email,billing_phone,account_status)
 values(p_customer,p_shop,trim(coalesce(p_values->>'account_number','')),coalesce((p_values->>'terms_days')::integer,0),nullif(p_values->>'credit_limit','')::numeric,coalesce((p_values->>'po_required')::boolean,false),trim(coalesce(p_values->>'billing_contact','')),trim(coalesce(p_values->>'billing_email','')),trim(coalesce(p_values->>'billing_phone','')),coalesce(p_values->>'account_status','active'))
 on conflict(customer_id) do update set account_number=excluded.account_number,terms_days=excluded.terms_days,credit_limit=excluded.credit_limit,po_required=excluded.po_required,billing_contact=excluded.billing_contact,billing_email=excluded.billing_email,billing_phone=excluded.billing_phone,account_status=excluded.account_status returning * into b;
 insert into public.customer_tax_profiles(shop_id,customer_id,tax_status,exemption_reason,exemption_certificate_number,exemption_certificate_path)
 values(p_shop,p_customer,p_values->>'tax_status',p_values->>'exemption_reason',p_values->>'exemption_certificate_number',nullif(certificate,''))
 on conflict(customer_id) do update set tax_status=excluded.tax_status,exemption_reason=excluded.exemption_reason,exemption_certificate_number=excluded.exemption_certificate_number,exemption_certificate_path=excluded.exemption_certificate_path;
 return to_jsonb(b);
end $$;
revoke all on function public.save_shop_customer_billing(uuid,text,jsonb) from public;
grant execute on function public.save_shop_customer_billing(uuid,text,jsonb) to authenticated;
create or replace function public.shop_customer_billing_snapshot(p_shop uuid,p_customer text) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('accountNumber',coalesce(b.account_number,''),'termsDays',coalesce(b.terms_days,0),'creditLimit',b.credit_limit,'poRequired',coalesce(b.po_required,false),'accountStatus',coalesce(b.account_status,'active'),'billingContact',coalesce(b.billing_contact,''),'billingEmail',coalesce(b.billing_email,''),'billingPhone',coalesce(b.billing_phone,''),'taxStatus',coalesce(t.tax_status,'inherit'),'exemptionReason',t.exemption_reason,'exemptionCertificateNumber',t.exemption_certificate_number,'capturedAt',now())
 from public."Customers" c left join public.customer_billing_profiles b on b.customer_id=c.id::text and b.shop_id=c.shop_id left join public.customer_tax_profiles t on t.customer_id=c.id::text and t.shop_id=c.shop_id where c.id::text=p_customer and c.shop_id=p_shop;
$$;
alter table public.shop_invoices add column if not exists billing_snapshot jsonb not null default '{}',add column if not exists purchase_order text not null default '';
alter table public.shop_repair_orders add column if not exists billing_snapshot jsonb not null default '{}';
update public.shop_repair_orders r set billing_snapshot=coalesce(public.shop_customer_billing_snapshot(r.shop_id,r.customer_id),'{}') where billing_snapshot='{}' and customer_id is not null and status not in ('Complete','Closed','Paid');
create or replace function public.capture_shop_billing() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare shop_day date;taxable boolean;rate numeric;base numeric;
begin
 -- The owner-only restore RPC runs as the database owner and preserves issued snapshots.
 -- Ordinary authenticated writes always capture defaults from the scoped customer record.
 if tg_op='INSERT' and current_user<>'authenticated' then
  new.billing_snapshot:=coalesce(new.billing_snapshot,'{}');
  if tg_table_name='shop_invoices' then new.purchase_order:=coalesce(new.purchase_order,'');end if;
  return new;
 end if;
 select (now() at time zone coalesce(nullif(timezone,''),'UTC'))::date into shop_day from public.shops where id=new.shop_id;
 if tg_table_name='shop_repair_orders' then
  if tg_op='INSERT' or new.customer_id is distinct from old.customer_id then new.billing_snapshot:=coalesce(public.shop_customer_billing_snapshot(new.shop_id,new.customer_id),'{}');else new.billing_snapshot:=old.billing_snapshot;end if;
 else
  new.purchase_order:=coalesce(new.purchase_order,'');
  if tg_op='INSERT' then new.billing_snapshot:=coalesce(public.shop_customer_billing_snapshot(new.shop_id,new.customer_id),'{}');
   if coalesce(new.billing_snapshot->>'billingEmail','')<>'' then new.customer_email:=new.billing_snapshot->>'billingEmail';end if;
   if coalesce(new.billing_snapshot->>'billingPhone','')<>'' then new.customer_phone:=new.billing_snapshot->>'billingPhone';end if;
   select case new.billing_snapshot->>'taxStatus' when 'taxable' then true when 'exempt' then false else default_taxable end,default_tax_rate into taxable,rate from public.shops where id=new.shop_id;
   rate:=case when taxable then rate else 0 end;
   base:=case when taxable then coalesce((new.tax_snapshot->>'taxableBase')::numeric,new.subtotal) else 0 end;
   if base<0 or base>new.subtotal then raise exception 'Invalid taxable invoice subtotal';end if;
   new.tax_amount:=round(base*rate/100,2);new.total:=new.subtotal+new.tax_amount;
   new.balance_due:=greatest(new.total-new.paid_total,0);
   new.tax_snapshot:=jsonb_build_object('taxable',taxable,'rate',rate,'taxableBase',base,'customerTaxStatus',new.billing_snapshot->>'taxStatus','exemptionReason',new.billing_snapshot->>'exemptionReason','exemptionCertificateNumber',new.billing_snapshot->>'exemptionCertificateNumber','capturedAt',now());
  else new.billing_snapshot:=old.billing_snapshot;new.customer_id:=old.customer_id;end if;
  if tg_op='UPDATE' and old.status<>'Draft' then new.purchase_order:=old.purchase_order;new.due_date:=old.due_date;new.sent_at:=old.sent_at;end if;
  if new.status='Sent' and (tg_op='INSERT' or old.status='Draft') then
   if coalesce((new.billing_snapshot->>'poRequired')::boolean,false) and trim(new.purchase_order)='' then raise exception 'This customer requires a purchase order before sending the invoice.';end if;
   new.sent_at:=now();new.due_date:=coalesce(shop_day,current_date)+coalesce((new.billing_snapshot->>'termsDays')::integer,0);
  end if;
 end if;return new;
end $$;
drop trigger if exists zz_shop_invoice_billing on public.shop_invoices;
create trigger zz_shop_invoice_billing before insert or update on public.shop_invoices for each row execute function public.capture_shop_billing();
-- Derive payment status only after tax and customer terms have been captured.
drop trigger if exists z_shop_payment_finance on public.shop_invoices;
drop trigger if exists zzz_shop_payment_finance on public.shop_invoices;
create trigger zzz_shop_payment_finance before insert or update on public.shop_invoices for each row execute function public.shop_payment_finance_guard();
drop trigger if exists zz_shop_ro_billing on public.shop_repair_orders;
create trigger zz_shop_ro_billing before insert or update on public.shop_repair_orders for each row execute function public.capture_shop_billing();
-- Reuse existing balance-driven automation; credit release also requires finished work.
create or replace function public.shop_paid_pickup_transition() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.repair_order_id is not null and (new.status='Paid' or (new.status='Sent' and coalesce((new.billing_snapshot->>'termsDays')::integer,0)>0 and new.billing_snapshot->>'accountStatus'='active' and not exists(select 1 from public.customer_billing_profiles b where b.shop_id=new.shop_id and b.customer_id=new.customer_id and b.account_status='hold'))) then
 update public.shop_repair_orders set status='Ready for Pickup' where id=new.repair_order_id and shop_id=new.shop_id and archived is not true and status='Ready for Payment';end if;return new;
end $$;
create or replace function public.shop_finished_paid_pickup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='Ready for Payment' and old.status<>'Complete' and exists(select 1 from public.shop_invoices i where i.repair_order_id=new.id and i.shop_id=new.shop_id and (i.status='Paid' and i.balance_due=0 or i.status='Sent' and coalesce((i.billing_snapshot->>'termsDays')::integer,0)>0 and i.billing_snapshot->>'accountStatus'='active' and not exists(select 1 from public.customer_billing_profiles b where b.shop_id=i.shop_id and b.customer_id=i.customer_id and b.account_status='hold'))) then new.status='Ready for Pickup';end if;return new;
end $$;
create or replace function public.shop_pickup_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='Ready for Pickup' and old.status<>new.status then
 insert into public.shop_payment_ro_events(shop_id,repair_order_id,invoice_id,previous_status,new_status,reason,recorded_by)
 select new.shop_id,new.id,i.id,old.status,new.status,case when i.status='Paid' then 'Work finished and invoice fully paid' else 'Work finished; invoice sent on approved NET terms' end,auth.uid() from public.shop_invoices i where i.repair_order_id=new.id and i.shop_id=new.shop_id and (i.status='Paid' and i.balance_due=0 or i.status='Sent' and coalesce((i.billing_snapshot->>'termsDays')::integer,0)>0 and i.billing_snapshot->>'accountStatus'='active');end if;return new;
end $$;
create or replace function public.shop_customer_management(p_shop uuid,p_search text default '',p_page integer default 0,p_size integer default 10,p_filter text default 'all',p_sort text default 'activity') returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;needle text:=lower(trim(coalesce(p_search,'')));digits text:=regexp_replace(coalesce(p_search,''),'[^0-9]','','g');shop_day date;
begin
 if not public.has_shop_role(p_shop,array['owner','admin','service_writer']) then raise exception 'Your role cannot open the customer desk.';end if;
 if p_page is null or p_page<0 or p_page>100000 or p_size is null or p_size not in (10,25,50) or length(needle)>200 or p_filter is null or p_filter not in ('all','outstanding','overdue','net','current') or p_sort is null or p_sort not in ('alphabetical','balance','overdue','activity') then raise exception 'Invalid customer search, filter or page.';end if;
 select (now() at time zone coalesce(nullif(timezone,''),'UTC'))::date into shop_day from public.shops where id=p_shop;
 with customers as (
 select c.id,c.name,c.contact_name,c.phone,c.email,c.created_at,coalesce(b.account_number,'') account_number,coalesce(b.terms_days,0) terms_days,coalesce(b.account_status,'active') account_status,b.credit_limit,
 (select count(*) from public.customer_units u where u.shop_id=p_shop and u.customer_id=c.id and u.archived is not true) vehicles,
 (select count(*) from public.shop_repair_orders r where r.shop_id=p_shop and r.customer_id=c.id::text and r.archived is not true and r.status not in ('Complete','Closed','Paid')) open_orders,
 coalesce(f.balance,0) balance,coalesce(f.overdue_amount,0) overdue_amount,f.oldest_due,
 greatest(c.created_at,(select max(r.updated_at) from public.shop_repair_orders r where r.shop_id=p_shop and r.customer_id=c.id::text),(select max(i.updated_at) from public.shop_invoices i where i.shop_id=p_shop and i.customer_id=c.id::text)) last_activity
 from public."Customers" c left join public.customer_billing_profiles b on b.customer_id=c.id::text and b.shop_id=c.shop_id
 left join lateral(select sum(i.balance_due) balance,sum(i.balance_due) filter(where i.due_date<coalesce(shop_day,current_date)) overdue_amount,min(i.due_date) filter(where i.due_date<coalesce(shop_day,current_date) and i.balance_due>0) oldest_due from public.shop_invoices i where i.shop_id=p_shop and i.customer_id=c.id::text and i.status='Sent')f on true
 where c.shop_id=p_shop and c.archived is not true
 ), matched as (
 select * from customers c where (needle='' or strpos(lower(concat_ws(' ',c.name,c.contact_name,c.phone,c.email,c.account_number)),needle)>0 or (length(digits)>=3 and needle !~ '[a-z]' and strpos(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),digits)>0) or exists(select 1 from public.customer_units u where u.shop_id=p_shop and u.customer_id=c.id and u.archived is not true and strpos(lower(concat_ws(' ',u.name,u.year,u.make,u.model,u.serial)),needle)>0))
 and case p_filter when 'outstanding' then balance>0 when 'overdue' then overdue_amount>0 when 'net' then terms_days>0 when 'current' then balance=0 else true end
 ), ranked as (select *,row_number() over(order by case when p_sort='alphabetical' then lower(name) end asc nulls last,case when p_sort='balance' then balance end desc nulls last,case when p_sort='overdue' then oldest_due end asc nulls last,case when p_sort='activity' then last_activity end desc nulls last,id) position from matched), page_rows as(select * from ranked order by position limit p_size offset p_page*p_size)
 select jsonb_build_object('count',(select count(*) from matched),'summary',jsonb_build_object('customers',(select count(*) from customers),'vehicles',(select count(*) from public.customer_units where shop_id=p_shop and archived is not true),'open_orders',(select count(*) from public.shop_repair_orders where shop_id=p_shop and archived is not true and status not in ('Complete','Closed','Paid')),'balance',coalesce((select sum(balance_due) from public.shop_invoices where shop_id=p_shop and status='Sent'),0),'overdue',coalesce((select sum(balance_due) from public.shop_invoices where shop_id=p_shop and status='Sent' and due_date<coalesce(shop_day,current_date)),0),'net_accounts',(select count(*) from customers where terms_days>0)),'rows',coalesce((select jsonb_agg(to_jsonb(c)-'position' order by position) from page_rows c),'[]')) into result;return result;
end $$;
revoke all on function public.shop_customer_management(uuid,text,integer,integer,text,text) from public;
grant execute on function public.shop_customer_management(uuid,text,integer,integer,text,text) to authenticated;
alter table public.customer_billing_audit add column if not exists restored_from_backup boolean not null default false;
create or replace function public.restore_shop_data_backup(backup jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
    target_shop uuid;
    item jsonb;
    restored integer := 0;
    affected integer := 0;
    payment public.shop_invoice_payments;
    original public.shop_invoice_payments;
    existing public.shop_invoice_payments;
    invoice_item jsonb;
    financial_audit public.customer_billing_audit;
    event public.shop_payment_ro_events;
    existing_event public.shop_payment_ro_events;
begin
    if backup->>'format' <> 'track-right-shop-backup'
       or coalesce((backup->>'version')::integer,0) <> 2 then
        raise exception 'Unsupported Track Right Shop backup';
    end if;
    target_shop := (backup->>'source_shop_id')::uuid;
    if not public.shop_has_permission(target_shop,'data.import') then
        raise exception 'Data-import permission is required';
    end if;
    if backup->'cloud' ? 'payments' then
        for invoice_item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) loop
            if coalesce((invoice_item->>'paid_total')::numeric,0) is distinct from
               (select coalesce(sum((value->>'amount')::numeric),0) from jsonb_array_elements(backup#>'{cloud,payments}') where value->>'invoice_id'=invoice_item->>'id') then
                raise exception 'Backup payment history does not match invoice paid total';
            end if;
        end loop;
    end if;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,customers}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Customer tenant validation failed'; end if;
        insert into public."Customers" select * from jsonb_populate_record(null::public."Customers",item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,billing_profiles}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Billing tenant validation failed';end if;
        insert into public.customer_billing_profiles select * from jsonb_populate_record(null::public.customer_billing_profiles,item) on conflict(customer_id) do nothing;
        get diagnostics affected=row_count;restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,tax_profiles}','[]'::jsonb)) loop
        if item->>'shop_id' is distinct from target_shop::text then raise exception 'Tax tenant validation failed';end if;
        insert into public.customer_tax_profiles select * from jsonb_populate_record(null::public.customer_tax_profiles,item) on conflict(customer_id) do nothing;
        get diagnostics affected=row_count;restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,billing_audit}','[]'::jsonb)) loop
        financial_audit:=jsonb_populate_record(null::public.customer_billing_audit,item);
        if financial_audit.shop_id is distinct from target_shop or not exists(select 1 from public."Customers" where id::text=financial_audit.customer_id and shop_id=target_shop) then raise exception 'Billing audit tenant validation failed';end if;
        financial_audit.restored_from_backup:=true;
        insert into public.customer_billing_audit select financial_audit.* on conflict(id) do nothing;
        get diagnostics affected=row_count;restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,units}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Unit tenant validation failed'; end if;
        insert into public.customer_units select * from jsonb_populate_record(null::public.customer_units,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,repair_orders}','[]'::jsonb)) loop
        if item->>'shop_id'<>target_shop::text then raise exception 'Repair order tenant validation failed'; end if;
        insert into public.shop_repair_orders select * from jsonb_populate_record(null::public.shop_repair_orders,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) loop
        if item->>'shop_id'<>target_shop::text then raise exception 'Invoice tenant validation failed'; end if;
        insert into public.shop_invoices select * from jsonb_populate_record(null::public.shop_invoices,case when item->>'status'='Paid' then jsonb_set(item,'{status}','"Sent"'::jsonb) else item end)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
        if affected=1 and item->>'status'='Paid' and not (backup->'cloud' ? 'payments') and (item->>'total')::numeric>0 then
            insert into public.shop_invoice_payments(shop_id,invoice_id,request_id,amount,method,payment_date,notes,restored_from_backup,restored_by,restored_at)
            values(target_shop,(item->>'id')::uuid,gen_random_uuid(),(item->>'total')::numeric,'legacy',coalesce((item->>'paid_at')::timestamptz,(item->>'created_at')::timestamptz)::date,'Restored pre-ledger Paid invoice; original payment method/staff were not recorded.',true,auth.uid(),now());
        end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,payments}','[]'::jsonb)) order by (value->>'reverses_id') is not null,(value->>'recorded_at')::timestamptz loop
        payment:=jsonb_populate_record(null::public.shop_invoice_payments,item);
        if not exists(select 1 from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) where value->>'id'=payment.invoice_id::text) then raise exception 'Backup payment invoice is missing'; end if;
        if payment.shop_id is distinct from target_shop or not exists(select 1 from public.shop_invoices where id=payment.invoice_id and shop_id=target_shop) then raise exception 'Payment tenant validation failed'; end if;
        if payment.method not in ('cash','card','check','bank_transfer','other','legacy') then raise exception 'Invalid backup payment method'; end if;
        if payment.reverses_id is not null then
            select * into original from public.shop_invoice_payments where id=payment.reverses_id;
            if original.id is null or original.invoice_id<>payment.invoice_id or original.shop_id<>target_shop or original.amount<>-payment.amount or original.reverses_id is not null then raise exception 'Invalid backup reversal'; end if;
        end if;
        select * into existing from public.shop_invoice_payments where id=payment.id;
        if existing.id is not null then
            if (to_jsonb(existing)-array['restored_from_backup','restored_by','restored_at']) is distinct from (to_jsonb(payment)-array['restored_from_backup','restored_by','restored_at']) then raise exception 'Existing payment audit differs from backup'; end if;
        else
            payment.restored_from_backup:=true;payment.restored_by:=auth.uid();payment.restored_at:=now();
            insert into public.shop_invoice_payments select payment.*;
            restored:=restored+1;
        end if;
    end loop;
    for invoice_item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,invoices}','[]'::jsonb)) loop
        if exists(select 1 from public.shop_invoice_payments where invoice_id=(invoice_item->>'id')::uuid having sum(amount)<0 or sum(amount)>(select total from public.shop_invoices where id=(invoice_item->>'id')::uuid)) then raise exception 'Backup payments exceed invoice balance'; end if;
        update public.shop_invoices set status=status where id=(invoice_item->>'id')::uuid and shop_id=target_shop;
        if coalesce((invoice_item->>'paid_total')::numeric,0)>0 and not exists(select 1 from public.shop_invoice_payments where invoice_id=(invoice_item->>'id')::uuid) then raise exception 'Backup is missing payment history'; end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,payment_ro_events}','[]'::jsonb)) loop
        event:=jsonb_populate_record(null::public.shop_payment_ro_events,item);
        if event.shop_id is distinct from target_shop or not exists(select 1 from public.shop_invoices where id=event.invoice_id and shop_id=target_shop and repair_order_id=event.repair_order_id) then raise exception 'Payment event tenant validation failed'; end if;
        select * into existing_event from public.shop_payment_ro_events where id=event.id;
        if existing_event.id is not null then
            if (to_jsonb(existing_event)-array['restored_from_backup','restored_by','restored_at']) is distinct from (to_jsonb(event)-array['restored_from_backup','restored_by','restored_at']) then raise exception 'Existing payment event audit differs from backup'; end if;
        else
            event.restored_from_backup:=true;event.restored_by:=auth.uid();event.restored_at:=now();
            insert into public.shop_payment_ro_events select event.*;
            restored:=restored+1;
        end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,accounts_payable}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Accounts payable tenant validation failed'; end if;
        insert into public.shop_accounts_payable select * from jsonb_populate_record(null::public.shop_accounts_payable,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,requests}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Request tenant validation failed'; end if;
        insert into public.shop_requests select * from jsonb_populate_record(null::public.shop_requests,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,calendar}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Calendar tenant validation failed'; end if;
        insert into public.shop_calendar_events select * from jsonb_populate_record(null::public.shop_calendar_events,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(backup#>'{cloud,appointments}','[]'::jsonb)) loop
        if item->>'shop_id' <> target_shop::text then raise exception 'Appointment tenant validation failed'; end if;
        insert into public.shop_appointments select * from jsonb_populate_record(null::public.shop_appointments,item)
        on conflict(id) do nothing;
        get diagnostics affected=row_count; restored:=restored+affected;
    end loop;
    return jsonb_build_object('restored',restored);
end;
$$;

revoke all on function public.restore_shop_data_backup(jsonb) from public;
grant execute on function public.restore_shop_data_backup(jsonb) to authenticated;


notify pgrst,'reload schema';
commit;
select to_regprocedure('public.save_shop_customer_billing(uuid,text,jsonb)') is not null as billing_installed,to_regprocedure('public.shop_customer_management(uuid,text,integer,integer,text,text)') is not null as customer_management_installed;
